import Foundation

enum TaskStatus: String, Codable {
    case running
    case review
    case done
    case suspended
}

enum CinderViewMode: String, CaseIterable {
    case active
    case suspended
    case shipped

    var title: String {
        switch self {
        case .active: return "进行中"
        case .suspended: return "挂起"
        case .shipped: return "已通过"
        }
    }
}

struct CinderTask: Identifiable, Codable, Equatable {
    let id: String
    var provider: String
    var cwd: String?
    var model: String?
    var effort: String?
    var permission: String?
    var sandbox: String?
    var approval: String?
    var lastPrompt: String
    var answer: String
    var log: String
    var status: TaskStatus
    var deferredCount: Int?
    var createdAt: String?
    var updatedAt: String?
    var completedAt: String?
    var commandPreview: String?

    var isReviewable: Bool {
        status == .review
    }

    var displayProvider: String {
        provider == "claude" ? "Claude Code" : "Codex CLI"
    }

    var bodyText: String {
        status == .running ? log : answer
    }

    var bodyTitle: String {
        status == .running ? "过程" : "答案"
    }
}

struct CinderOptions: Codable {
    var providers: [String: ProviderOptions]
}

struct ProviderOptions: Codable {
    var defaultModel: String?
    var defaultEffort: String?
    var models: [ModelOption]
    var efforts: [String]
}

struct ModelOption: Codable, Hashable {
    var value: String
    var label: String
    var defaultEffort: String?
    var efforts: [String]?
}

struct ModelSelection: Identifiable, Hashable {
    let provider: String
    let model: String
    let label: String
    let defaultEffort: String
    let efforts: [String]

    var id: String {
        "\(provider)|\(model)"
    }

    var providerTitle: String {
        provider == "claude" ? "Claude Code" : "Codex CLI"
    }

    var menuTitle: String {
        model.isEmpty ? "\(providerTitle) · 默认" : "\(providerTitle) · \(label)"
    }
}

struct HostConnection: Codable, Equatable {
    var baseURL: String
    var token: String

    var displayURL: String {
        baseURL
            .replacingOccurrences(of: "http://", with: "")
            .replacingOccurrences(of: "https://", with: "")
    }

    static func parse(_ rawText: String) -> HostConnection? {
        let trimmed = rawText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed), let scheme = url.scheme, let host = url.host else {
            return nil
        }
        var components = URLComponents()
        components.scheme = scheme
        components.host = host
        components.port = url.port
        let base = components.url?.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")) ?? trimmed
        let token = URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?
            .first(where: { $0.name == "token" })?
            .value ?? ""
        return HostConnection(baseURL: base, token: token)
    }
}

struct EmptyResponse: Decodable {}
