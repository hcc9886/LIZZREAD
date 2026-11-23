// 用法：把本文件加入 ios/App/App.xcodeproj，再在 AppDelegate 或自定义 ViewController 里调用
//   LZStoreKit.shared.listen()
// JS 侧已实现：Capacitor.Plugins.Purchases（与 @revenuecat/purchases-capacitor 同名）。
// 若不想装 RevenueCat，可换成下面的桥（等价接口），JS 无需改动：
//
//   Capacitor 会把原生插件注册为 window.Capacitor.Plugins.<插件名>，
//   在 ios/App/App/ViewController.swift 的 webView 里注入：
//
//   let js = """
//   window.Capacitor = window.Capacitor || {};
//   window.Capacitor.Plugins = window.Capacitor.Plugins || {};
//   window.Capacitor.Plugins.Purchases = {
//     getProducts: (o) => window.webkit.messageHandlers.lzIAP.postMessage({op:'products', ids:o.productIdentifiers||o.productIds}),
//     purchaseProduct: (o) => window.webkit.messageHandlers.lzIAP.postMessage({op:'buy', id:o.productIdentifier}),
//     restorePurchases: () => window.webkit.messageHandlers.lzIAP.postMessage({op:'restore'})
//   };
//   """
//   webView.evaluateJavaScript(js)
//
// 原生端处理 lzIAP 消息后，回写：
//   webView.evaluateJavaScript("window.__lzIapCallback(\(json))")
//   并在 JS 里把 __lzIapCallback 解析成上面的返回值（getProducts → {products:[...]}，
//   purchaseProduct → {customerInfo:{entitlements:{active:{...}}}}）。
//
// 下面的 LZStoreKit 是 StoreKit2 的最小实现，商品 ID 与 index.html 的 IAP_PRODUCTS 一致：
//   com.lizzread.one.month / com.lizzread.all.month / com.lizzread.all.quarter / com.lizzread.all.year

import Foundation
import StoreKit

@available(iOS 15.0, *)
final class LZStoreKit {
    static let shared = LZStoreKit()
    private var updatesTask: Task<Void, Never>?

    /// 启动时调用：监听交易（续订、退款、家人共享都会走到这里）
    func listen() {
        updatesTask = Task.detached {
            for await result in Transaction.updates {
                if case .verified(let tx) = result {
                    await tx.finish()
                    print("[LZStoreKit] updated:", tx.productID)
                }
            }
        }
    }

    /// 拉商品（JS: getProducts）
    func products(ids: [String]) async -> [[String: Any]] {
        do {
            let items = try await Product.products(for: ids)
            return items.map { p in
                [
                    "identifier": p.id,
                    "title": p.displayName,
                    "description": p.description,
                    "priceString": p.displayPrice
                ]
            }
        } catch { return [] }
    }

    /// 购买（JS: purchaseProduct）
    func purchase(id: String) async -> [String: Any] {
        do {
            guard let product = try await Product.products(for: [id]).first else {
                return ["error": "product not found"]
            }
            let result = try await product.purchase()
            switch result {
            case .success(let verification):
                if case .verified(let tx) = verification {
                    await tx.finish()
                    return ["productId": tx.productID, "expiresDate": ISO8601DateFormatter().string(from: Date().addingTimeInterval(31 * 86400))]
                }
                return ["error": "unverified"]
            case .userCancelled: return ["error": "cancelled"]
            case .pending: return ["error": "pending"]
            @unknown default: return ["error": "unknown"]
            }
        } catch { return ["error": error.localizedDescription] }
    }

    /// 恢复购买（JS: restorePurchases；App Store 审核要求）
    func restore() async -> [[String: Any]] {
        var out: [[String: Any]] = []
        for await result in Transaction.currentEntitlements {
            if case .verified(let tx) = result {
                out.append(["productId": tx.productID, "expiresDate": ISO8601DateFormatter().string(from: tx.expirationDate ?? Date())])
            }
        }
        try? await AppStore.sync()
        return out
    }
}
