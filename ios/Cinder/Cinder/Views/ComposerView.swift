import SwiftUI

struct ComposerView: View {
    @EnvironmentObject private var store: TaskStore
    @FocusState private var isFocused: Bool

    var body: some View {
        VStack(spacing: 8) {
            if !store.errorMessage.isEmpty {
                Text(store.errorMessage)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(CinderTheme.accent)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            ZStack(alignment: .bottomTrailing) {
                TextEditor(text: $store.composerText)
                    .focused($isFocused)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(CinderTheme.text)
                    .frame(minHeight: 112, maxHeight: 150)
                    .padding(.horizontal, 10)
                    .padding(.top, 10)
                    .padding(.bottom, 42)
                    .scrollContentBackgroundHiddenIfAvailable()

                if store.composerText.isEmpty {
                    Text(placeholder)
                        .font(.system(size: 17, weight: .bold))
                        .foregroundColor(CinderTheme.muted)
                        .padding(.leading, 15)
                        .padding(.top, 18)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                        .allowsHitTesting(false)
                }

                HStack(spacing: 8) {
                    modelMenu
                    effortMenu
                    Spacer()
                    Button {
                        Task {
                            await store.send()
                        }
                    } label: {
                        Image(systemName: "arrow.up")
                            .font(.system(size: 19, weight: .black))
                            .foregroundColor(.black)
                            .frame(width: 42, height: 42)
                            .background(store.composerText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? CinderTheme.muted : CinderTheme.success)
                            .clipShape(Circle())
                    }
                    .buttonStyle(.plain)
                    .disabled(store.composerText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                .padding(10)
            }
            .background(CinderTheme.panel)
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(isFocused ? Color.blue : CinderTheme.line, lineWidth: isFocused ? 2 : 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
    }

    private var placeholder: String {
        if store.currentTask?.status == .running {
            return "追加需求，当前步骤结束后继续"
        }
        if store.mode == .suspended {
            return "输入需求以恢复挂起任务"
        }
        if store.currentTask == nil {
            return "告诉 Cinder 要运行什么"
        }
        return "输入后续需求"
    }

    private var modelMenu: some View {
        Menu {
            ForEach(store.modelSelections) { selection in
                Button(selection.menuTitle) {
                    store.selectedModelID = selection.id
                    store.selectedEffort = selection.defaultEffort
                }
            }
        } label: {
            controlLabel(store.selectedModel.menuTitle)
        }
    }

    private var effortMenu: some View {
        Menu {
            ForEach(store.availableEfforts, id: \.self) { effort in
                Button(effort.isEmpty ? "默认" : effort) {
                    store.selectedEffort = effort
                }
            }
        } label: {
            controlLabel(store.selectedEffort.isEmpty ? "推理强度 · 默认" : "推理强度 · \(store.selectedEffort)")
        }
    }

    private func controlLabel(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 12, weight: .black))
            .foregroundColor(CinderTheme.text)
            .lineLimit(1)
            .padding(.horizontal, 10)
            .frame(height: 32)
            .background(Color.black.opacity(0.28))
            .clipShape(Capsule())
    }
}

private extension View {
    @ViewBuilder
    func scrollContentBackgroundHiddenIfAvailable() -> some View {
        if #available(iOS 16.0, *) {
            self.scrollContentBackground(.hidden)
        } else {
            self
        }
    }
}
