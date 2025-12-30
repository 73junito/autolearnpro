#!/usr/bin/env python3
"""Test thumbnail generation with network access."""

import os
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from scripts.generate_thumbnails import generate_thumbnail, download_image  # noqa: E402


def test_generate_thumbnail():
    """Test thumbnail generation."""
    # Check for API key
    if not os.getenv("OPENAI_API_KEY"):
        print("Skipping test: OPENAI_API_KEY not set")
        return

    print("Testing thumbnail generation...")
    title = "Introduction to Python Programming"
    description = "Learn Python basics"

    url = generate_thumbnail(title, description)

    if url:
        print(f"Success! Generated thumbnail URL: {url}")

        # Test download
        test_file = Path("/tmp/test_thumbnail.png")
        if download_image(url, test_file):
            print(f"Downloaded to {test_file}")
            print(f"File size: {test_file.stat().st_size} bytes")
        else:
            print("Failed to download image")
    else:
        print("Failed to generate thumbnail")


if __name__ == "__main__":
    test_generate_thumbnail()
