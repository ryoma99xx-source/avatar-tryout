# アバター試作（Webアプリ版）

iPhoneのSafariからカメラで撮った生き物を、Muse Image などで可愛いアバターにする試作アプリ。
fal.ai のAPIキーはサーバー（Vercel）側にだけ置き、ページは合言葉で守る。

## Vercelの環境変数
- `FAL_KEY` : fal.ai のAPIキー
- `ACCESS_CODE` : 合言葉（自分で決める。ページの最初に入れる）

## 構成
- `public/index.html` : 画面（写真の縮小、指示文の組み立て、結果表示）
- `api/generate.js` : fal.ai への中継（モデルは許可したものだけ）
