#!/bin/bash

set -e

# Check if the clean parameter is passed
if [ "$1" = "clean" ]; then
  echo "Cleaning the database..."
  # Empty the database by running the Prisma migrate reset command
  npx prisma migrate reset --force --skip-generate --skip-seed
fi

echo "Installing dependencies..."
if ! npm install; then
    echo "Failed to install dependencies."
    exit 1
fi

echo "Generating Prisma client..."
if ! npx prisma generate; then
    echo "Failed to generate Prisma client."
    exit 1
fi

echo "Creating new migrations (if needed)..."
if ! npx prisma migrate dev --name init; then
    echo "Failed to create new migrations."
    exit 1
fi

echo "Running database migrations..."
if ! npx prisma migrate deploy; then
    echo "Failed to run database migrations."
    exit 1
fi

echo "Cleaning the dist directory..."
rm -rf dist

echo "Building the project..."
if ! npx tsc; then
    echo "Failed to build the project."
    exit 1
fi

echo "Build completed successfully."