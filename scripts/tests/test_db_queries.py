import json
from types import SimpleNamespace
import scripts.generate_questions_gpu_v2 as gen


def make_mock_psycopg2(fetch_result=None):
    executed = []

    class MockCursor:
        def __init__(self, fetch_result=None):
            self._fetch = fetch_result
            self.executed = executed

        def execute(self, sql, params=None):
            # record call
            self.executed.append((sql, params))

        def fetchone(self):
            return self._fetch

        def close(self):
            pass

    class MockConn:
        def __init__(self, cursor):
            self._cursor = cursor
            self.committed = False

        def cursor(self):
            return self._cursor

        def commit(self):
            self.committed = True

        def close(self):
            pass

    class MockPsycopg:
        def __init__(self):
            self._last_conn_args = None

        def connect(self, *args, **kwargs):
            # return a new connection with fresh cursor
            cur = MockCursor(fetch_result)
            return MockConn(cur)

    return MockPsycopg(), executed


def test_get_or_create_bank_direct_db_existing():
    # Arrange: mock psycopg2 with a cursor that returns an existing id
    mock_psycopg2, executed = make_mock_psycopg2(fetch_result=(123,))
    gen.DIRECT_DB = True
    gen._psycopg2 = mock_psycopg2

    # Act
    bank_id = gen.get_or_create_bank("ev", "easy", pg_pod=None)

    # Assert
    assert bank_id == 123
    # first executed should be SELECT with parameter (name,)
    assert executed, "No SQL executed"
    select_sql, params = executed[0]
    assert "SELECT id FROM question_banks" in select_sql
    assert params == ("EV - EASY",) or params == ("EV - EASY",)


def test_insert_question_direct_db_parameterized():
    mock_psycopg2, executed = make_mock_psycopg2(fetch_result=None)
    gen.DIRECT_DB = True
    gen._psycopg2 = mock_psycopg2

    question = {
        "question_type": "multiple_choice",
        "question_text": "What color is the sky?",
        "difficulty": "easy",
        "topic": "Atmosphere",
        "learning_objective": "Identify sky color",
        "ase_standard": "A1.A.1",
        "question_data": {"options": ["Blue", "Green"], "correct": 0},
        "explanation": "Because of Rayleigh scattering."
    }

    success = gen.insert_question(question, 7, pg_pod=None)
    assert success is True
    # Verify that an INSERT was executed with parameters
    assert executed, "No SQL executed"
    insert_sql, params = executed[0]
    assert "INSERT INTO questions" in insert_sql
    # params should be a tuple and contain bank_id and question fields
    assert params[0] == 7
    assert params[1] == question["question_type"]
    assert params[2] == question["question_text"]
    assert json.loads(params[7]) == question["question_data"]
