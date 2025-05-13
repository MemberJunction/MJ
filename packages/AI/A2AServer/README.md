# MemberJunction A2A Server

This package provides a Google Agent-to-Agent (A2A) protocol server implementation for MemberJunction. It allows MemberJunction to expose its capabilities as an A2A agent, enabling interoperability with other A2A-compliant agents.

## About Agent-to-Agent (A2A) Protocol

A2A is an open protocol developed by Google that enables communication and interoperability between opaque agentic applications. The protocol is designed to facilitate collaboration between AI agents built on different platforms and frameworks.

- Official A2A Documentation: [https://google.github.io/A2A/](https://google.github.io/A2A/)
- GitHub Repository: [https://github.com/google/A2A](https://github.com/google/A2A)
- Protocol Specification: [https://google.github.io/A2A/specification/](https://google.github.io/A2A/specification/)

## Features

- Implements the Google A2A protocol specification
- Exposes MemberJunction entities as agent capabilities
- Supports task-based interactions
- Handles authentication and security
- Provides streaming responses with Server-Sent Events (SSE)

## Installation

```bash
npm install @memberjunction/a2aserver
```

## Configuration

Add A2A server configuration to your MemberJunction config file:

```javascript
// mj.config.js
module.exports = {
  // other MJ configuration...
  
  a2aServerSettings: {
    enableA2AServer: true,
    port: 3200,
    entityCapabilities: [
      {
        entityName: "*",
        schemaName: "*", 
        get: true,
        create: false,
        update: false,
        delete: false
      }
      // Add more capabilities as needed
    ]
  }
}
```

## Usage

```javascript
import { initializeA2AServer } from '@memberjunction/a2aserver';

// Start the A2A server
initializeA2AServer();
```

## Protocol Implementation

This package implements the Google A2A protocol as specified at: https://google.github.io/A2A/

The implementation includes:
- Agent card publication
- Task lifecycle management
- Message and artifact handling
- Authentication and security
- Streaming responses via SSE

## License

MIT