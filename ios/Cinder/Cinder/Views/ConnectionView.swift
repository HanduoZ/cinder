import SwiftUI
import UIKit

struct ConnectionView: View {
    @EnvironmentObject private var store: TaskStore
    @State private var urlText = ""

    var body: some View {
        ZStack {
            CinderTheme.background.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 18) {
                Spacer()
                Image(systemName: "flame.fill")
                    .font(.system(size: 44, weight: .black))
                    .foregroundColor(CinderTheme.accent)
                Text("Cinder")
                    .font(.system(size: 42, weight: .black, design: .rounded))
                    .foregroundColor(.white)
                Text("连接你 Mac 上正在运行的 Cinder host。")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(CinderTheme.muted)

                VStack(spacing: 10) {
                    TextField("http://192.168.x.x:3737/?token=...", text: $urlText)
                        .keyboardType(.URL)
                        .autocapitalization(.none)
                        .disableAutocorrection(true)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(CinderTheme.text)
                        .padding(14)
                        .background(CinderTheme.panel)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

                    HStack(spacing: 10) {
                        Button {
                            urlText = UIPasteboard.general.string ?? urlText
                        } label: {
                            Text("粘贴")
                                .font(.system(size: 16, weight: .black))
                                .foregroundColor(CinderTheme.text)
                                .frame(maxWidth: .infinity)
                                .frame(height: 48)
                                .background(CinderTheme.panel)
                                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        }
                        .buttonStyle(.plain)

                        Button {
                            Task {
                                await store.connect(from: urlText)
                            }
                        } label: {
                            Text("连接")
                                .font(.system(size: 16, weight: .black))
                                .foregroundColor(.black)
                                .frame(maxWidth: .infinity)
                                .frame(height: 48)
                                .background(CinderTheme.success)
                                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
                if !store.errorMessage.isEmpty {
                    Text(store.errorMessage)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(CinderTheme.accent)
                }
                Text("Mac 上打开 Cinder 后，复制 Phone/iPad URL 到这里。")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(CinderTheme.muted)
                Spacer()
            }
            .padding(22)
        }
        .onAppear {
            if urlText.isEmpty, let pasted = UIPasteboard.general.string, pasted.contains(":3737") {
                urlText = pasted
            }
        }
    }
}
