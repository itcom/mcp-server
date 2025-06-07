#!/bin/bash
cd /home/web/ssl-shop.jp/acme_shop/mcp-server

# 環境変数の読み込み
source .env

# サーバルートの存在確認
if [ ! -d "$SERVER_ROOT" ]; then
    echo "エラー: SERVER_ROOT ディレクトリが存在しません: $SERVER_ROOT"
    exit 1
fi

# プロセスが既に起動している場合は停止
pkill -f "node dist/index.js"

# ビルドと起動
npm run build
npm start
