#!/usr/bin/env python3
"""Generate thumbnails for courses using OpenAI DALL-E."""

import os
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Import third-party and local modules after path setup
# ruff: noqa: E402
import openai
import requests
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Course


def get_database_url():
    """Get database URL from environment."""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("Error: DATABASE_URL not set in environment")
        sys.exit(1)
    return database_url


def get_openai_key():
    """Get OpenAI API key from environment."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("Error: OPENAI_API_KEY not set in environment")
        sys.exit(1)
    return api_key


def generate_thumbnail(course_title, course_description):
    """Generate a thumbnail using DALL-E."""
    client = openai.OpenAI(api_key=get_openai_key())

    prompt = (
        f"Create a modern, professional thumbnail for an online course "
        f"titled '{course_title}'.\n"
        f"Course description: {course_description}\n"
        f"Style: Clean, educational, engaging, with relevant imagery."
    )

    try:
        response = client.images.generate(
            model="dall-e-3",
            prompt=prompt,
            size="1024x1024",
            quality="standard",
            n=1,
        )

        image_url = response.data[0].url
        return image_url

    except Exception as e:
        print(f"Error generating thumbnail: {e}")
        return None


def download_image(url, filepath):
    """Download an image from a URL to a local file."""
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()

        with open(filepath, "wb") as f:
            f.write(response.content)

        return True
    except Exception as e:
        print(f"Error downloading image: {e}")
        return False


def process_courses(limit=None):
    """Process courses and generate thumbnails."""
    database_url = get_database_url()
    engine = create_engine(database_url)
    Session = sessionmaker(bind=engine)
    session = Session()

    try:
        # Query courses without thumbnails
        query = session.query(Course).filter(
            (Course.thumbnail_url is None) | (Course.thumbnail_url == "")
        )

        if limit:
            query = query.limit(limit)

        courses = query.all()

        if not courses:
            print("No courses found that need thumbnails.")
            return

        print(f"Found {len(courses)} courses to process.")

        # Create thumbnails directory
        thumbnails_dir = project_root / "static" / "thumbnails"
        thumbnails_dir.mkdir(parents=True, exist_ok=True)

        for i, course in enumerate(courses, 1):
            print(f"\n[{i}/{len(courses)}] Processing: {course.title}")

            # Generate thumbnail
            image_url = generate_thumbnail(course.title, course.description or "")

            if not image_url:
                print("  Skipping due to generation error.")
                continue

            # Download image
            filename = f"course_{course.id}.png"
            filepath = thumbnails_dir / filename

            if download_image(image_url, filepath):
                # Update course with local thumbnail path
                course.thumbnail_url = f"/static/thumbnails/{filename}"
                session.commit()
                print(f"  Success! Saved to {filepath}")
            else:
                print("  Failed to download image.")

    except Exception as e:
        print(f"Error processing courses: {e}")
        session.rollback()
    finally:
        session.close()


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Generate thumbnails for courses"
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="Limit number of courses to process",
        default=None,
    )

    args = parser.parse_args()

    print("Starting thumbnail generation...")
    process_courses(limit=args.limit)
    print("\nDone!")


if __name__ == "__main__":
    main()
