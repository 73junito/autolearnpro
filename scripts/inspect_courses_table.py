#!/usr/bin/env python3
"""Script to inspect the structure of the courses table in the database."""

import os
import sys
from pathlib import Path

# Add the project root to the Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

try:
    from sqlalchemy import create_engine, inspect
    from sqlalchemy.orm import sessionmaker
except ImportError as e:
    print("Error: Required packages not installed.")
    print("Please run: pip install sqlalchemy psycopg2-binary")
    sys.exit(1)


def get_database_url():
    """Get database URL from environment variables."""
    try:
        return os.environ["DATABASE_URL"]
    except KeyError as e:
        print("Error: DATABASE_URL environment variable not set.")
        print("Please set it in your .env file or environment.")
        raise SystemExit(1) from e


def inspect_courses_table():
    """Inspect and display the structure of the courses table."""
    database_url = get_database_url()

    # Create engine and session
    engine = create_engine(database_url)
    Session = sessionmaker(bind=engine)
    session = Session()

    try:
        # Create inspector
        inspector = inspect(engine)

        # Check if courses table exists
        if "courses" not in inspector.get_table_names():
            print("Error: 'courses' table does not exist in the database.")
            raise SystemExit(1) from None

        print("\n=== Courses Table Structure ===")
        print("\nColumns:")

        # Get column information
        columns = inspector.get_columns("courses")
        for column in columns:
            nullable = "NULL" if column["nullable"] else "NOT NULL"
            default = f" DEFAULT {column['default']}" if column.get("default") else ""
            print(f"  - {column['name']}: {column['type']} {nullable}{default}")

        # Get primary key
        print("\nPrimary Key:")
        pk = inspector.get_pk_constraint("courses")
        if pk and pk.get("constrained_columns"):
            print(f"  - {', '.join(pk['constrained_columns'])}")

        # Get foreign keys
        print("\nForeign Keys:")
        fks = inspector.get_foreign_keys("courses")
        if fks:
            for fk in fks:
                print(f"  - {fk['constrained_columns']} -> {fk['referred_table']}.{fk['referred_columns']}")
        else:
            print("  - None")

        # Get indexes
        print("\nIndexes:")
        indexes = inspector.get_indexes("courses")
        if indexes:
            for idx in indexes:
                unique = "UNIQUE" if idx.get("unique") else ""
                print(f"  - {idx['name']}: {', '.join(idx['column_names'])} {unique}")
        else:
            print("  - None")

    except Exception as e:
        print(f"Error inspecting database: {e}")
        raise SystemExit(1) from e
    finally:
        session.close()


if __name__ == "__main__":
    inspect_courses_table()
