# Use the official Node.js image as the base image
FROM node:20 AS base

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package.json package-lock.json ./

# Install dependencies using npm workspaces
RUN npm install

# Copy necessary files and directories for the build
COPY migrations ./migrations
COPY SQL\ Scripts ./SQL\ Scripts
COPY packages/GeneratedActions ./packages/GeneratedActions
COPY packages/GeneratedEntities ./packages/GeneratedEntities
COPY packages/MJAPI ./packages/MJAPI

# Build the MJAPI application
RUN npm run build

# Use a smaller base image for the final image
FROM node:20-slim AS final

# Set the working directory
WORKDIR /app

# Copy the built application from the previous stage
COPY --from=base /app .

# Install the MJCLI package globally
RUN npm install -g @memberjunction/cli

# Copy the entrypoint script
COPY docker/entrypoint.sh /entrypoint.sh

# Make the entrypoint script executable
RUN chmod +x /entrypoint.sh

# Set the entrypoint for the container
ENTRYPOINT ["/entrypoint.sh"]
