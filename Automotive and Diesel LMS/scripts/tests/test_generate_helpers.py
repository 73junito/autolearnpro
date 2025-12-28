from scripts.generate_questions_gpu import create_prompt, validate_question


def test_create_prompt_structure():
    prompt = create_prompt("ev", "multiple_choice", "easy", 1, ["L3.A.1"])
    assert "Generate EXACTLY" in prompt
    assert "ASE STANDARDS" in prompt


def test_validate_question():
    q = {
        "question_type": "multiple_choice",
        "question_text": "What is a battery?",
        "difficulty": "easy",
        "points": 1,
        "ase_standard": "A1",
        "question_data": {"correct": 0}
    }
    assert validate_question(q) is True

    q_bad = {"question_type": "multiple_choice"}
    assert validate_question(q_bad) is False
