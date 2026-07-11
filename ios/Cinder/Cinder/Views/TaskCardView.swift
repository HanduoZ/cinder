import SwiftUI

struct TaskCardView: View {
    @EnvironmentObject private var store: TaskStore
    let task: CinderTask
    @State private var offset: CGSize = .zero

    var body: some View {
        VStack(spacing: 10) {
            cardHeader
            promptPanel
            answerPanel
        }
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(CinderTheme.card)
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(CinderTheme.line, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .offset(x: offset.width * 0.35, y: offset.height < 0 ? offset.height * 0.2 : 0)
        .rotationEffect(.degrees(Double(offset.width / 34)))
        .gesture(dragGesture)
        .animation(.spring(response: 0.24, dampingFraction: 0.82), value: offset)
    }

    private var cardHeader: some View {
        HStack(spacing: 8) {
            Text(task.status == .running ? "RUNNING" : task.displayProvider)
                .font(.system(size: 12, weight: .black))
                .foregroundColor(task.status == .running ? .black : CinderTheme.text)
                .padding(.horizontal, 10)
                .padding(.vertical, 7)
                .background(task.status == .running ? Color.yellow : CinderTheme.activePanel)
                .clipShape(Capsule())
            Text(task.model?.isEmpty == false ? task.model! : "默认模型")
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(CinderTheme.muted)
                .lineLimit(1)
            Spacer()
            Text(store.deckPositionText())
                .font(.system(size: 13, weight: .black, design: .rounded))
                .foregroundColor(CinderTheme.muted)
        }
    }

    private var promptPanel: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("上次请求")
                .font(.system(size: 12, weight: .black))
                .foregroundColor(CinderTheme.muted)
            ScrollView {
                Text(task.lastPrompt.isEmpty ? " " : task.lastPrompt)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(CinderTheme.text)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .textSelection(.enabled)
            }
        }
        .padding(14)
        .frame(maxHeight: 145)
        .background(CinderTheme.panel)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var answerPanel: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(task.bodyTitle)
                    .font(.system(size: 12, weight: .black))
                    .foregroundColor(CinderTheme.muted)
                Spacer()
                if task.status == .review && store.mode == .active {
                    Button {
                        Task {
                            await store.approveCurrent()
                        }
                    } label: {
                        Text("完成")
                            .font(.system(size: 15, weight: .black))
                            .foregroundColor(.black)
                            .padding(.horizontal, 18)
                            .padding(.vertical, 10)
                            .background(CinderTheme.success)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            ScrollViewReader { proxy in
                ScrollView {
                    Text(task.bodyText.isEmpty ? " " : task.bodyText)
                        .font(.system(size: 14, weight: .semibold, design: .monospaced))
                        .foregroundColor(CinderTheme.text)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .textSelection(.enabled)
                    Color.clear.frame(height: 1).id("bottom")
                }
                .onChange(of: task.log) { _ in
                    if task.status == .running {
                        withAnimation(.easeOut(duration: 0.16)) {
                            proxy.scrollTo("bottom", anchor: .bottom)
                        }
                    }
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(CinderTheme.answer)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var dragGesture: some Gesture {
        DragGesture(minimumDistance: 16)
            .onChanged { value in
                offset = value.translation
            }
            .onEnded { value in
                let width = value.translation.width
                let height = value.translation.height
                defer { offset = .zero }
                if abs(width) > 72 && abs(width) > abs(height) * 1.25 {
                    store.moveCard(width < 0 ? 1 : -1)
                    return
                }
                if height < -82 && abs(height) > abs(width) * 1.2 {
                    Task {
                        await store.suspendCurrent()
                    }
                }
            }
    }
}
