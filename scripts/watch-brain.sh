#!/bin/bash
# Watch the AI Brain in real-time
echo "🧠 Connecting to AI Worker logs..."
echo "------------------------------------------------"
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
tail -f "$DIR/../worker.out"
