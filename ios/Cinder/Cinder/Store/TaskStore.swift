import Foundation
import SwiftUI

@MainActor
final class TaskStore: ObservableObject {
    @Published var connection: HostConnection?
    @Published var tasks: [CinderTask] = []
    @Published var options = CinderOptions(providers: [:])
    @Published var mode: CinderViewMode = .active
    @Published var currentTask: CinderTask?
    @Published var composerText = ""
    @Published var selectedModelID = ""
    @Published var selectedEffort = ""
    @Published var isLoading = false
    @Published var errorMessage = ""

    private var indices: [CinderViewMode: Int] = [.active: 0, .suspended: 0, .shipped: 0]
    private var currentIDs: [CinderViewMode: String] = [:]
    private let defaults = UserDefaults.standard

    init() {
        if let data = defaults.data(forKey: "cinder.hostConnection"),
           let saved = try? JSONDecoder().decode(HostConnection.self, from: data) {
            connection = saved
        }
    }

    var api: CinderAPI? {
        guard let connection else { return nil }
        return CinderAPI(connection: connection)
    }

    var activeTasks: [CinderTask] {
        tasks
            .filter { $0.status == .running || $0.status == .review }
            .sorted(by: activeSort)
    }

    var suspendedTasks: [CinderTask] {
        tasks.filter { $0.status == .suspended }
    }

    var shippedTasks: [CinderTask] {
        tasks.filter { $0.status == .done }
    }

    var currentQueue: [CinderTask] {
        queue(for: mode)
    }

    var modelSelections: [ModelSelection] {
        let providerOrder = ["codex", "claude"]
        var selections: [ModelSelection] = []
        for provider in providerOrder {
            let providerOptions = options.providers[provider]
            let models = providerOptions?.models ?? []
            if models.isEmpty {
                selections.append(
                    ModelSelection(
                        provider: provider,
                        model: "",
                        label: "默认",
                        defaultEffort: providerOptions?.defaultEffort ?? "",
                        efforts: providerOptions?.efforts ?? []
                    )
                )
            } else {
                for model in models {
                    selections.append(
                        ModelSelection(
                            provider: provider,
                            model: model.value,
                            label: model.label,
                            defaultEffort: model.defaultEffort ?? providerOptions?.defaultEffort ?? "",
                            efforts: model.efforts ?? providerOptions?.efforts ?? []
                        )
                    )
                }
            }
        }
        return selections
    }

    var selectedModel: ModelSelection {
        let selections = modelSelections
        if let selected = selections.first(where: { $0.id == selectedModelID }) {
            return selected
        }
        return selections.first ?? ModelSelection(provider: "codex", model: "", label: "默认", defaultEffort: "", efforts: [])
    }

    var availableEfforts: [String] {
        let efforts = selectedModel.efforts.filter { !$0.isEmpty }
        return efforts.isEmpty ? ["", "low", "medium", "high"] : [""] + efforts
    }

    func connect(from text: String) async {
        guard let parsed = HostConnection.parse(text) else {
            errorMessage = "粘贴 Mac 上显示的 Phone/iPad URL。"
            return
        }
        connection = parsed
        persistConnection()
        await refreshAll()
    }

    func disconnect() {
        connection = nil
        defaults.removeObject(forKey: "cinder.hostConnection")
        tasks = []
        currentTask = nil
    }

    func refreshAll() async {
        guard let api else { return }
        isLoading = true
        do {
            async let fetchedTasks = api.tasks()
            async let fetchedOptions = api.options()
            tasks = try await fetchedTasks
            options = try await fetchedOptions
            ensureModelSelection()
            reconcileCurrent()
            errorMessage = ""
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func refreshTasks() async {
        guard let api else { return }
        do {
            tasks = try await api.tasks()
            reconcileCurrent()
            errorMessage = ""
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func switchMode(_ nextMode: CinderViewMode) {
        mode = nextMode
        composerText = ""
        reconcileCurrent()
    }

    func moveCard(_ delta: Int) {
        let queue = currentQueue
        guard queue.count > 1 else { return }
        let oldIndex = indices[mode] ?? 0
        let nextIndex = (oldIndex + delta + queue.count) % queue.count
        indices[mode] = nextIndex
        currentIDs[mode] = queue[nextIndex].id
        currentTask = queue[nextIndex]
    }

    func send() async {
        let prompt = composerText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !prompt.isEmpty, let api else { return }
        let model = selectedModel
        let effort = selectedEffort == "默认" ? "" : selectedEffort
        composerText = ""

        do {
            if let task = currentTask, mode == .active || mode == .suspended {
                _ = try await api.continueTask(id: task.id, model: model.model, effort: effort, prompt: prompt)
                currentIDs[mode] = nil
                if mode == .suspended {
                    mode = .active
                }
            } else {
                _ = try await api.createTask(provider: model.provider, model: model.model, effort: effort, prompt: prompt)
                currentIDs[.active] = nil
                mode = .active
            }
            await refreshTasks()
            errorMessage = ""
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func suspendCurrent() async {
        guard mode == .active, let task = currentTask, let api else { return }
        do {
            currentIDs[.active] = nil
            _ = try await api.suspendTask(id: task.id)
            await refreshTasks()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func approveCurrent() async {
        guard mode == .active, let task = currentTask, task.status == .review, let api else { return }
        do {
            currentIDs[.active] = nil
            _ = try await api.completeTask(id: task.id)
            await refreshTasks()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func queue(for viewMode: CinderViewMode) -> [CinderTask] {
        switch viewMode {
        case .active:
            return activeTasks
        case .suspended:
            return suspendedTasks
        case .shipped:
            return shippedTasks
        }
    }

    func deckPositionText() -> String {
        let queue = currentQueue
        guard let currentTask, let index = queue.firstIndex(where: { $0.id == currentTask.id }) else {
            return "0/0"
        }
        return "\(index + 1)/\(queue.count)"
    }

    private func reconcileCurrent() {
        let queue = currentQueue
        guard !queue.isEmpty else {
            currentTask = nil
            currentIDs[mode] = nil
            indices[mode] = 0
            return
        }

        if let id = currentIDs[mode], let index = queue.firstIndex(where: { $0.id == id }) {
            indices[mode] = index
            currentTask = queue[index]
            return
        }

        let index = min(max(indices[mode] ?? 0, 0), queue.count - 1)
        indices[mode] = index
        currentIDs[mode] = queue[index].id
        currentTask = queue[index]
    }

    private func ensureModelSelection() {
        let selections = modelSelections
        if selectedModelID.isEmpty || !selections.contains(where: { $0.id == selectedModelID }) {
            selectedModelID = selections.first?.id ?? "codex|"
        }
        if selectedEffort.isEmpty {
            selectedEffort = selectedModel.defaultEffort
        }
    }

    private func activeSort(_ left: CinderTask, _ right: CinderTask) -> Bool {
        if left.status != right.status {
            return left.status == .review
        }
        return (left.updatedAt ?? left.createdAt ?? "") > (right.updatedAt ?? right.createdAt ?? "")
    }

    private func persistConnection() {
        guard let connection, let data = try? JSONEncoder().encode(connection) else { return }
        defaults.set(data, forKey: "cinder.hostConnection")
    }
}
