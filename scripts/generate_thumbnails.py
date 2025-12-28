#!/usr/bin/env python3
"""
Generate thumbnails for all images in the database.
This script connects to the PostgreSQL database, fetches all image records,
and generates thumbnails for images that don't have one yet.
"""

import os
import sys
import logging
from pathlib import Path
import subprocess
import time

# Add the parent directory to the path so we can import from the app
sys.path.insert(0, str(Path(__file__).parent.parent))

from app import create_app, db
from app.models import Image
from app.utils.image_processing import generate_thumbnail

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def wait_for_postgres(max_attempts=30, delay=2):
    """
    Wait for PostgreSQL to be ready.
    
    Args:
        max_attempts: Maximum number of connection attempts
        delay: Delay in seconds between attempts
    
    Returns:
        bool: True if PostgreSQL is ready, False otherwise
    """
    logger.info("Waiting for PostgreSQL to be ready...")
    
    for attempt in range(max_attempts):
        try:
            # Try to get the postgres pod
            result = subprocess.run(
                ['kubectl', 'get', 'pods', '-l', 'app=postgres', '-o', 'name'],
                capture_output=True,
                text=True,
                check=True
            )
            
            pod_name = result.stdout.strip()
            if not pod_name:
                logger.warning(f"Attempt {attempt + 1}/{max_attempts}: No postgres pod found")
                time.sleep(delay)
                continue
            
            # Check if the pod is ready
            result = subprocess.run(
                ['kubectl', 'get', pod_name, '-o', 'jsonpath={.status.conditions[?(@.type=="Ready")].status}'],
                capture_output=True,
                text=True,
                check=True
            )
            
            if result.stdout.strip() == "True":
                logger.info("PostgreSQL is ready!")
                return True
            
            logger.info(f"Attempt {attempt + 1}/{max_attempts}: PostgreSQL not ready yet")
            time.sleep(delay)
            
        except subprocess.CalledProcessError as e:
            logger.warning(f"Attempt {attempt + 1}/{max_attempts}: Error checking postgres status: {e}")
            time.sleep(delay)
    
    logger.error("PostgreSQL did not become ready in time")
    return False


def get_postgres_pod_name():
    """
    Get the name of the postgres pod.
    
    Returns:
        str: The name of the postgres pod
    
    Raises:
        RuntimeError: If the postgres pod cannot be found
    """
    try:
        result = subprocess.run(
            ['kubectl', 'get', 'pods', '-l', 'app=postgres', '-o', 'jsonpath={.items[0].metadata.name}'],
            capture_output=True,
            text=True,
            check=True
        )
        
        pod_name = result.stdout.strip()
        if not pod_name:
            raise RuntimeError("No postgres pod found")
        
        return pod_name
    
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"Failed to find postgres pod: {e}") from e


def check_database_connection(app):
    """
    Check if we can connect to the database and fetch records.
    
    Args:
        app: Flask application instance
    
    Returns:
        bool: True if connection is successful, False otherwise
    """
    try:
        with app.app_context():
            # Try to query the database
            count = Image.query.count()
            logger.info(f"Successfully connected to database. Found {count} images.")
            return True
    except Exception as e:
        logger.error(f"Failed to connect to database: {e}")
        return False


def fetch_images_needing_thumbnails(app):
    """
    Fetch all images that need thumbnails generated.
    
    Args:
        app: Flask application instance
    
    Returns:
        list: List of Image objects that need thumbnails
    """
    try:
        with app.app_context():
            images = Image.query.filter(
                (Image.thumbnail_path == None) | (Image.thumbnail_path == '')
            ).all()
            logger.info(f"Found {len(images)} images needing thumbnails")
            return images
    except Exception as e:
        raise RuntimeError(f"Failed to fetch from DB: {e}") from e


def generate_thumbnails_for_images(app, images):
    """
    Generate thumbnails for a list of images.
    
    Args:
        app: Flask application instance
        images: List of Image objects
    
    Returns:
        tuple: (success_count, error_count)
    """
    success_count = 0
    error_count = 0
    
    with app.app_context():
        for idx, image in enumerate(images, 1):
            try:
                logger.info(f"Processing image {idx}/{len(images)}: {image.filename}")
                
                # Check if the original image file exists
                if not os.path.exists(image.file_path):
                    logger.warning(f"Original image not found: {image.file_path}")
                    error_count += 1
                    continue
                
                # Generate thumbnail
                thumbnail_path = generate_thumbnail(image.file_path)
                
                if thumbnail_path:
                    image.thumbnail_path = thumbnail_path
                    db.session.commit()
                    logger.info(f"Successfully generated thumbnail: {thumbnail_path}")
                    success_count += 1
                else:
                    logger.error(f"Failed to generate thumbnail for {image.filename}")
                    error_count += 1
                    
            except Exception as e:
                logger.error(f"Error processing image {image.filename}: {e}")
                error_count += 1
                db.session.rollback()
    
    return success_count, error_count


def main():
    """Main function to generate thumbnails for all images."""
    logger.info("Starting thumbnail generation script")
    
    # Wait for PostgreSQL to be ready
    if not wait_for_postgres():
        logger.error("PostgreSQL is not ready. Exiting.")
        sys.exit(1)
    
    # Create Flask app
    app = create_app()
    
    # Check database connection
    if not check_database_connection(app):
        logger.error("Cannot connect to database. Exiting.")
        sys.exit(1)
    
    # Fetch images needing thumbnails
    try:
        images = fetch_images_needing_thumbnails(app)
    except RuntimeError as e:
        logger.error(str(e))
        sys.exit(1)
    
    if not images:
        logger.info("No images need thumbnails. Exiting.")
        return
    
    # Generate thumbnails
    success_count, error_count = generate_thumbnails_for_images(app, images)
    
    # Summary
    logger.info("=" * 50)
    logger.info("Thumbnail generation completed")
    logger.info(f"Total images processed: {len(images)}")
    logger.info(f"Successful: {success_count}")
    logger.info(f"Errors: {error_count}")
    logger.info("=" * 50)
    
    if error_count > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
