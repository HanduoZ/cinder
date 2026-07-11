import Foundation

enum CinderAPIError: LocalizedError {
    case invalidConnection
    case badResponse
    case server(String)

    var errorDescription: String? {
        switch self {
        case .invalidConnection:
            return "Invalid Cinder host URL."
        case .badResponse:
            return "Cinder host returned an invalid response."
        case .server(let message):
            return message
        }
    }
}

final class CinderAPI {
    private let connection: HostConnection
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    init(connection: HostConnection) {
        self.connection = connection
    }

    func status() async throws {
        let _: StatusResponse = try await request(path: "/api/status")
    }

    func tasks() async throws -> [CinderTask] {
        try await request(path: "/api/tasks")
    }

    func options() async throws -> CinderOptions {
        try await request(path: "/api/options")
    }

    func createTask(provider: String, model: String, effort: String, prompt: String) async throws -> CinderTask {
        try await request(
            path: "/api/tasks",
            method: "POST",
            body: TaskRequest(provider: provider, model: model, effort: effort, prompt: prompt)
        )
    }

    func continueTask(id: String, model: String, effort: String, prompt: String) async throws -> CinderTask {
        try await request(
            path: "/api/tasks/\(id)/continue",
            method: "POST",
            body: ContinueRequest(model: model, effort: effort, prompt: prompt)
        )
    }

    func suspendTask(id: String) async throws -> CinderTask {
        try await request(path: "/api/tasks/\(id)/later", method: "POST", body: EmptyBody())
    }

    func completeTask(id: String) async throws -> CinderTask {
        try await request(path: "/api/tasks/\(id)/complete", method: "POST", body: EmptyBody())
    }

    private func request<T: Decodable, B: Encodable>(path: String, method: String = "GET", body: B? = Optional<EmptyBody>.none) async throws -> T {
        guard let baseURL = URL(string: connection.baseURL), let url = URL(string: path, relativeTo: baseURL) else {
            throw CinderAPIError.invalidConnection
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if !connection.token.isEmpty {
            request.setValue(connection.token, forHTTPHeaderField: "X-Cinder-Token")
        }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(body)
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw CinderAPIError.badResponse
        }
        guard (200..<300).contains(http.statusCode) else {
            if let serverError = try? decoder.decode(ServerError.self, from: data) {
                throw CinderAPIError.server(serverError.error)
            }
            throw CinderAPIError.server("Cinder host returned HTTP \(http.statusCode).")
        }
        if data.isEmpty, T.self == EmptyResponse.self {
            return EmptyResponse() as! T
        }
        return try decoder.decode(T.self, from: data)
    }
}

private struct StatusResponse: Decodable {
    var ok: Bool
}

private struct ServerError: Decodable {
    var error: String
}

private struct EmptyBody: Encodable {}

private struct TaskRequest: Encodable {
    var provider: String
    var model: String
    var effort: String
    var prompt: String
}

private struct ContinueRequest: Encodable {
    var model: String
    var effort: String
    var prompt: String
}
