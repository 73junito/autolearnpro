#!/usr/bin/env python3
"""
Test script for Ollama Python integration
"""
import sys
import subprocess

def main():
    """Main function that wraps the ollama testing logic"""
    print("Testing Ollama Python integration...")
    print("-" * 50)
    
    # Check if ollama is installed and running
    try:
        result = subprocess.run(['ollama', 'list'], 
                              capture_output=True, 
                              text=True, 
                              timeout=5)
        if result.returncode != 0:
            print("❌ Ollama is not running or not installed")
            print("Please install Ollama from https://ollama.ai")
            return 1
    except FileNotFoundError:
        print("❌ Ollama command not found")
        print("Please install Ollama from https://ollama.ai")
        return 1
    except subprocess.TimeoutExpired:
        print("❌ Ollama command timed out")
        return 1
    
    print("✓ Ollama is installed and running")
    print("\nAvailable models:")
    print(result.stdout)
    
    # Test importing ollama module
    try:
        import ollama
        print("✓ Ollama Python module imported successfully")
    except ImportError as e:
        print(f"❌ Failed to import ollama module: {e}")
        print("Install it with: pip install ollama")
        return 1
    
    # Test a simple ollama operation
    try:
        print("\nTesting ollama.list()...")
        models = ollama.list()
        print(f"✓ Successfully retrieved model list: {len(models.get('models', []))} models found")
        
        # Test chat functionality with a simple prompt
        if models.get('models'):
            model_name = models['models'][0]['name']
            print(f"\nTesting chat with model: {model_name}")
            response = ollama.chat(
                model=model_name,
                messages=[
                    {
                        'role': 'user',
                        'content': 'Say "Hello, AutoLearnPro!" and nothing else.'
                    }
                ]
            )
            print(f"✓ Chat response: {response['message']['content']}")
        else:
            print("⚠ No models available for chat test")
            print("Pull a model with: ollama pull llama2")
    
    except Exception as e:
        print(f"❌ Error during ollama operation: {e}")
        return 1
    
    print("\n" + "=" * 50)
    print("✓ All Ollama Python tests passed!")
    print("=" * 50)
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
