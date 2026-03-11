#!/bin/bash

echo "================================================================"
echo "[Atlas Architect] Starting Full Installation..."
echo "================================================================"
echo ""

echo "[1/3] Installing Backend Dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "[ERROR] Backend npm install failed."
    exit 1
fi
echo ""

echo "[2/3] Installing Viewer Dependencies..."
cd viewer || exit
npm install
if [ $? -ne 0 ]; then
    echo "[ERROR] Viewer npm install failed."
    exit 1
fi
cd .. || exit
echo ""

echo "[3/3] Compiling Engine and Syncing Global Skill..."
node atlas.mjs build
if [ $? -ne 0 ]; then
    echo "[ERROR] Atlas build failed."
    exit 1
fi
echo ""

echo "================================================================"
echo "[SUCCESS] Atlas Architect is installed and the Gemini Skill is active!"
echo ""
echo "To initialize a new project: node $(pwd)/atlas.mjs init"
echo "================================================================"
