#!/usr/bin/env python3
"""Standardize course index numbers in the database."""

import os
import sys
from pathlib import Path

# Add the project root to the Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

try:
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.models import Course
except ImportError:
    print("Error: Required packages not installed.")
    print("Please run: pip install sqlalchemy psycopg2-binary")
    sys.exit(1)


def get_database_url():
    """Get database URL from environment variables."""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("Error: DATABASE_URL environment variable not set.")
        print("Please set it in your .env file or environment.")
        sys.exit(1)
    return database_url


def standardize_course_index():
    """Standardize course index numbers to be sequential."""
    database_url = get_database_url()

    # Create engine and session
    engine = create_engine(database_url)
    Session = sessionmaker(bind=engine)
    session = Session()

    try:
        # Get all courses ordered by current index
        courses = session.query(Course).order_by(Course.index).all()

        if not courses:
            print("No courses found in the database.")
            return

        print(f"Found {len(courses)} courses.")
        print("\n=== Current State ===")
        for course in courses:
            print(f"  Course {course.id}: index={course.index}, title={course.title}")

        # Ask for confirmation
        print("\n=== Proposed Changes ===")
        print("Will renumber courses to have sequential indexes starting from 1:")
        for i, course in enumerate(courses, 1):
            if course.index != i:
                print(f"  Course {course.id}: {course.index} -> {i}")

        response = input("\nProceed with renumbering? (yes/no): ")
        if response.lower() not in ["yes", "y"]:
            print("Operation cancelled.")
            return

        # Update indexes
        print("\nUpdating indexes...")
        for i, course in enumerate(courses, 1):
            if course.index != i:
                old_index = course.index
                course.index = i
                print(f"  Updated course {course.id}: {old_index} -> {i}")

        # Commit changes
        session.commit()
        print("\n=== Success ===")
        print("Course indexes have been standardized.")

        # Display final state
        print("\n=== Final State ===")
        courses = session.query(Course).order_by(Course.index).all()
        for course in courses:
            print(f"  Course {course.id}: index={course.index}, title={course.title}")

    except Exception as e:
        print(f"\nError: {e}")
        session.rollback()
        sys.exit(1)
    finally:
        session.close()


def add_course_indexes():
    """Add index column to courses if it doesn't exist."""
    database_url = get_database_url()

    # Create engine
    engine = create_engine(database_url)

    try:
        with engine.connect() as conn:
            # Check if index column exists
            result = conn.execute(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'courses' AND column_name = 'index'
                """
            )

            if result.fetchone():
                print("Index column already exists.")
                return

            print("Adding index column to courses table...")

            # Add index column
            conn.execute(
                """
                ALTER TABLE courses
                ADD COLUMN index INTEGER
                """
            )

            # Set initial values based on id
            conn.execute(
                """
                UPDATE courses
                SET index = id
                """
            )

            conn.commit()
            print("Index column added successfully.")

    except Exception as e:
        print(f"Error adding index column: {e}")
        sys.exit(1)


def reset_course_indexes():
    """Reset all course indexes to match their IDs."""
    database_url = get_database_url()

    # Create engine and session
    engine = create_engine(database_url)
    Session = sessionmaker(bind=engine)
    session = Session()

    try:
        courses = session.query(Course).all()

        if not courses:
            print("No courses found in the database.")
            return

        print(f"Found {len(courses)} courses.")
        print("\nResetting indexes to match course IDs...")

        for course in courses:
            if course.index != course.id:
                old_index = course.index
                course.index = course.id
                print(f"  Course {course.id}: {old_index} -> {course.id}")

        session.commit()
        print("\nIndexes reset successfully.")

    except Exception as e:
        print(f"Error resetting indexes: {e}")
        session.rollback()
        sys.exit(1)
    finally:
        session.close()


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Manage course index numbers"
    )
    parser.add_argument(
        "action",
        choices=["add", "standardize", "reset"],
        help="Action to perform",
    )

    args = parser.parse_args()

    if args.action == "add":
        add_course_indexes()
    elif args.action == "standardize":
        standardize_course_index()
    elif args.action == "reset":
        reset_course_indexes()


if __name__ == "__main__":
    main()
