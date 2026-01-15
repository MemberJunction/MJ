#!/bin/bash

# Generate self-signed TLS certificates for development
# These certificates should NOT be used in production!

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERTS_DIR="$SCRIPT_DIR/../certs"

echo "🔐 Generating self-signed TLS certificates for MCP Server..."
echo ""

# Create certs directory if it doesn't exist
mkdir -p "$CERTS_DIR"

# Generate private key and certificate
openssl req -x509 -newkey rsa:4096 \
  -keyout "$CERTS_DIR/server.key" \
  -out "$CERTS_DIR/server.crt" \
  -days 365 -nodes \
  -subj "/C=US/ST=Development/L=Local/O=MemberJunction/OU=Dev/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

if [ $? -eq 0 ]; then
    echo "✅ Certificates generated successfully!"
    echo ""
    echo "📁 Certificate files:"
    echo "   Private Key: $CERTS_DIR/server.key"
    echo "   Certificate: $CERTS_DIR/server.crt"
    echo ""
    echo "⚠️  IMPORTANT: These are self-signed certificates for development only."
    echo "   Do NOT use these certificates in production!"
    echo ""
    echo "🔧 To enable TLS in mj.config.cjs, add:"
    echo ""
    echo "   mcpServerSettings: {"
    echo "     port: 3100,"
    echo "     enableMCPServer: true,"
    echo "     tls: {"
    echo "       enabled: true,"
    echo "       certPath: './packages/AI/MCPServer/certs/server.crt',"
    echo "       keyPath: './packages/AI/MCPServer/certs/server.key',"
    echo "       selfSigned: true"
    echo "     }"
    echo "   }"
    echo ""
    echo "📝 Test with curl:"
    echo "   curl --cacert $CERTS_DIR/server.crt https://localhost:3100/mcp \\"
    echo "     -H \"Authorization: Bearer mj_sk_...\""
else
    echo "❌ Failed to generate certificates"
    exit 1
fi
