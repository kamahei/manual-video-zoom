# Target sites / 対象サイト

Version 1.0.0 enables the generic HTML5 controller on these HTTPS page scopes with no interaction. A listed domain is an implementation target, **not a claim of verified streaming compatibility**: the controller has been verified in a real Chrome session against a local test player, but signed-in playback has not been tested on any of these services.

**Any other site works too**, once you allow it: open the popup there and press the button naming that site. The grant is per origin, survives reloads and restarts, and can be reviewed or removed in `chrome://extensions` under Details, Site access. The popup's Site access section also offers a single grant for every site. Nothing outside the table below is reachable until you do this, and the install-time permission warning covers only the table.

| Service | Page scope |
|---|---|
| Netflix | netflix.com and subdomains |
| U-NEXT | video.unext.jp |
| Hulu Japan | www.hulu.jp, hulu.jp |
| Hulu US | www.hulu.com, hulu.com |
| YouTube | www.youtube.com, youtube.com |
| Disney+ | www.disneyplus.com, disneyplus.com |
| Prime Video | www.primevideo.com, primevideo.com |
| Amazon video JP/US | www.amazon.co.jp and www.amazon.com, only /gp/video/* and /detail/* |
| Apple TV | tv.apple.com |
| ABEMA | abema.tv |
| TVer | tver.jp |

Amazon shopping pages are outside the fixed injection path scope; allowing the site from the popup covers the whole origin.  Open a matching video URL directly and reload if arriving through in-page navigation. Once a content script is injected, it remains in that document until a full navigation or reload; SPA URL changes do not revoke it. Amazon territories other than JP/US are not included.

The same limits apply to sites you allow yourself. Only main-document HTML5 videos are inspected. Iframes, shadow-root players and picture-in-picture are not supported. Ads, previews and Shorts on matching origins can receive the same zoom. CSS-based rendering can conflict with a service's own layout. Reset or disable on affected pages. No video capture, download, DRM bypass or automatic black-bar detection is performed.

公式URLの確認と実際の再生検証は別です。各サイトで通常表示・全画面・字幕・次のエピソード・リセットを確認するまで、ストア説明でもここでも「動作確認済み」とは書かないでください。未確認の項目は動作確認済みとして扱わないでください。

Domain references: [Disney+](https://www.disneyplus.com/), [Prime Video](https://www.primevideo.com/), [Apple TV](https://tv.apple.com/), [Hulu US](https://www.hulu.com/), [ABEMA](https://abema.tv/), [TVer](https://tver.jp/).
