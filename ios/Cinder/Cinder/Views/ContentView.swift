import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var store: TaskStore

    var body: some View {
        Group {
            if store.connection == nil {
                ConnectionView()
            } else {
                mainView
            }
        }
        .preferredColorScheme(.dark)
    }

    private var mainView: some View {
        ZStack {
            CinderTheme.background.ignoresSafeArea()
            VStack(spacing: 12) {
                header
                modeTabs
                if let task = store.currentTask {
                    TaskCardView(task: task)
                        .transition(.asymmetric(insertion: .move(edge: .trailing), removal: .move(edge: .leading)))
                } else {
                    emptyCard
                }
                if store.mode != .shipped {
                    ComposerView()
                }
            }
            .padding(.horizontal, 14)
            .padding(.top, 12)
            .padding(.bottom, 8)
        }
        .task {
            await store.refreshAll()
        }
        .onReceive(Timer.publish(every: 2, on: .main, in: .common).autoconnect()) { _ in
            Task {
                await store.refreshTasks()
            }
        }
    }

    private var header: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Cinder")
                    .font(.system(size: 30, weight: .black, design: .rounded))
                    .foregroundColor(.white)
                Text(store.connection?.displayURL ?? "")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(CinderTheme.muted)
                    .lineLimit(1)
            }
            Spacer()
            Button {
                store.disconnect()
            } label: {
                Image(systemName: "gearshape.fill")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(CinderTheme.text)
                    .frame(width: 42, height: 42)
                    .background(CinderTheme.panel)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .buttonStyle(.plain)
        }
    }

    private var modeTabs: some View {
        HStack(spacing: 8) {
            tab(.active, count: store.activeTasks.count)
            tab(.suspended, count: store.suspendedTasks.count)
            tab(.shipped, count: store.shippedTasks.count)
        }
    }

    private func tab(_ mode: CinderViewMode, count: Int) -> some View {
        Button {
            withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
                store.switchMode(mode)
            }
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text("\(count)")
                    .font(.system(size: 21, weight: .black, design: .rounded))
                Text(mode.title)
                    .font(.system(size: 12, weight: .bold))
            }
            .foregroundColor(store.mode == mode ? .white : CinderTheme.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(store.mode == mode ? CinderTheme.activePanel : CinderTheme.panel)
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(store.mode == mode ? CinderTheme.accent : CinderTheme.line, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private var emptyCard: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: store.mode == .suspended ? "tray.fill" : "flame.fill")
                .font(.system(size: 32, weight: .bold))
                .foregroundColor(CinderTheme.accent)
            Text(emptyTitle)
                .font(.system(size: 20, weight: .black, design: .rounded))
                .foregroundColor(.white)
            Text(emptySubtitle)
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(CinderTheme.muted)
                .multilineTextAlignment(.center)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(20)
        .background(CinderTheme.card)
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(CinderTheme.line, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var emptyTitle: String {
        switch store.mode {
        case .active:
            return "没有进行中的卡片"
        case .suspended:
            return "没有挂起的卡片"
        case .shipped:
            return "没有已通过的卡片"
        }
    }

    private var emptySubtitle: String {
        switch store.mode {
        case .active:
            return "直接输入新任务，或等 Mac 上的 agent 跑完。"
        case .suspended:
            return "在进行中卡片上滑，就会放到这里。"
        case .shipped:
            return "点完成的任务会进这里。"
        }
    }
}

enum CinderTheme {
    static let background = Color(red: 0.05, green: 0.06, blue: 0.08)
    static let panel = Color(red: 0.10, green: 0.11, blue: 0.14)
    static let activePanel = Color(red: 0.16, green: 0.12, blue: 0.11)
    static let card = Color(red: 0.09, green: 0.10, blue: 0.13)
    static let answer = Color(red: 0.13, green: 0.14, blue: 0.18)
    static let text = Color(red: 0.93, green: 0.91, blue: 0.86)
    static let muted = Color(red: 0.67, green: 0.65, blue: 0.60)
    static let line = Color(red: 0.20, green: 0.22, blue: 0.28)
    static let accent = Color(red: 1.00, green: 0.38, blue: 0.26)
    static let success = Color(red: 0.20, green: 0.82, blue: 0.62)
}
