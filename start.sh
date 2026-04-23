#!/bin/bash
# HireTrack Job Agent — run this anytime to restart
# Double-click this file in Finder, or run: bash start.sh

cd "$(dirname "$0")"

echo ""
echo "================================================"
echo "  HireTrack Job Agent"
echo "================================================"
echo ""

# Set API key — replace with your actual key
export ANTHROPIC_API_KEY="your-anthropic-key-here"

echo "Choose what to do:"
echo "  1) Prepare applications (scan + score + generate resume/cover letter)"
echo "  2) Full auto-apply (scan + score + submit)"
echo "  3) Dry run (scan only, no applying)"
echo "  4) Cleanup generated files"
echo ""
read -p "Enter 1, 2, 3 or 4: " choice

case $choice in
  1) node prepare-applications.mjs ;;
  2) node autonomous.mjs ;;
  3) node prepare-applications.mjs --dry-run ;;
  4) node prepare-applications.mjs --cleanup ;;
  *) echo "Invalid choice" ;;
esac
