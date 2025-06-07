# MCP File Operations Server

A powerful Model Context Protocol (MCP) server built with Express.js that provides seamless file operations for AI assistants like Claude Desktop and Web Claude.

## 🚀 Features

- **Universal Compatibility**: Works with both Claude Desktop and Web Claude
- **GitHub Specification Compliant**: Follows official GitHub MCP server timing and protocol standards
- **Web Claude Optimization**: Special handling for Web Claude's 9-second timeout limitations
- **OAuth Integration**: Full OAuth 2.0 flow for secure Web Claude connections
- **File Operations**: Comprehensive file system access with security controls
- **Laravel Project Support**: Built-in Laravel project structure analysis
- **Real-time Updates**: SSE (Server-Sent Events) for real-time communication
- **Configurable Endpoints**: Environment-based endpoint configuration
- **Session Management**: Advanced session tracking and cleanup

## 📋 Requirements

- **Node.js**: v18.0.0 or higher
- **npm**: Latest version
- **TypeScript**: v5.5.0 or higher

## 🛠️ Installation

### Quick Setup

```bash
# Clone the repository
git clone <your-repo-url>
cd mcp-file-operations-server

# Install dependencies
npm install

# Create environment configuration
cp .env.example .env

# Build the project
npm run build

# Start the server
npm start
```

### Development Setup

```bash
# Install dependencies
npm install

# Start in development mode with auto-reload
npm run dev
```

## ⚙️ Configuration

Create a `.env` file in the root directory:

```env
# Server Configuration
BASE_URL=http://localhost:3001
ENDPOINT_PATH=/mcp-test
PORT=3001

# File System
SERVER_ROOT=/path/to/your/project

# Security (Optional)
ALLOWED_EXTENSIONS=.php,.js,.ts,.json,.md,.txt,.yaml,.yml
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BASE_URL` | Base URL for the server | `http://localhost:3001` |
| `ENDPOINT_PATH` | MCP endpoint path | `/mcp-test` |
| `PORT` | Server port | `3001` |
| `SERVER_ROOT` | Root directory for file operations | `process.cwd()` |

## 🎯 Usage

### With Claude Desktop

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "file-operations": {
      "command": "node",
      "args": ["/path/to/mcp-server/dist/index.js"],
      "env": {
        "SERVER_ROOT": "/path/to/your/project",
        "PORT": "3001"
      }
    }
  }
}
```

### With Web Claude

1. Start the server locally or deploy to your server
2. In Web Claude, go to **Integrations** → **Add Integration**
3. Enter your server URL: `http://localhost:3001/mcp-test` (or your deployed URL)
4. Complete the OAuth flow
5. Start using the file operations tools!

## 🔧 Available Tools

### `list_files`
List files and directories with filtering options.

```json
{
  "directory": ".",
  "recursive": false,
  "include_hidden": false,
  "exclude_dirs": ["vendor", "node_modules", "storage", ".git"]
}
```

### `read_file`
Read file contents with encoding support.

```json
{
  "file_path": "path/to/file.txt",
  "encoding": "utf8"
}
```

### `get_laravel_structure`
Analyze Laravel project structure and get statistics.

```json
{
  "project_root": ".",
  "include_config": true
}
```

### `search_files`
Search files with pattern matching and content search.

```json
{
  "directory": ".",
  "pattern": "Controller", 
  "content_search": "function",
  "file_extension": ".php"
}
```

### `get_server_info`
Get server status and configuration information.

```json
{}
```

## 🏗️ Architecture

### Core Components

- **Express.js Server**: Main HTTP server with CORS and middleware support
- **SSE Handler**: Server-Sent Events for real-time communication
- **OAuth Provider**: Complete OAuth 2.0 implementation for Web Claude
- **Session Manager**: Advanced session tracking and cleanup
- **Protocol Manager**: Dynamic MCP protocol version handling
- **File System Security**: Path sanitization and file type validation

### GitHub Specification Compliance

This server follows GitHub's official MCP server specifications:

- ✅ **500ms Initialization Timing**: Matches GitHub's official initialization delay
- ✅ **Dual Heartbeat Strategy**: 30-second GitHub-compliant + 8-second Web Claude optimization
- ✅ **Protocol Version 2024-11-05**: Fixed to GitHub's standard protocol version
- ✅ **Proper SSE Headers**: GitHub-compliant Server-Sent Events configuration

## 🚀 Deployment

### Local Development

```bash
npm run dev
```

### Production

```bash
# Build the project
npm run build

# Start with PM2 (recommended)
pm2 start dist/index.js --name mcp-server

# Or start directly
npm start
```

### Docker (Optional)

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist
COPY .env ./

EXPOSE 3001
CMD ["npm", "start"]
```

## 🔒 Security Features

- **Path Sanitization**: Prevents directory traversal attacks
- **File Type Restrictions**: Configurable allowed file extensions
- **CORS Protection**: Proper cross-origin resource sharing configuration
- **Session Management**: Automatic cleanup of inactive sessions
- **OAuth Security**: Secure token-based authentication for Web Claude

## 🐛 Troubleshooting

### Common Issues

**Port already in use**
```bash
# Find and kill the process using port 3001
lsof -ti:3001 | xargs kill -9
```

**File access denied**
- Check `SERVER_ROOT` path in `.env`
- Verify file permissions
- Ensure the path exists and is readable

**Web Claude connection timeout**
- Verify OAuth endpoints are accessible
- Check firewall settings
- Ensure SSL/HTTPS configuration if deployed

**Claude Desktop not detecting server**
- Verify the path in `claude_desktop_config.json`
- Check that the built `dist/index.js` file exists
- Restart Claude Desktop after configuration changes

## 📚 API Reference

### Health Check
```http
GET /health
```

Returns server status and active sessions.

### OAuth Endpoints
```http
GET /.well-known/oauth-authorization-server
GET /authorize
POST /token
GET /.well-known/jwks.json
```

### MCP Endpoint
```http
GET /mcp-test    # SSE connection for real-time communication
POST /mcp-test   # JSON-RPC tool execution
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Anthropic](https://anthropic.com) for the Model Context Protocol specification
- [GitHub MCP Server](https://github.com/github/github-mcp-server) for specification compliance reference
- The MCP community for protocol development and best practices

## 📞 Support

If you encounter any issues or have questions:

1. Check the [Troubleshooting](#-troubleshooting) section
2. Search existing [Issues](../../issues)
3. Create a new issue with detailed information

---

**Made with ❤️ for the MCP community**