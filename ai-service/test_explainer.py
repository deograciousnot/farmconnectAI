import asyncio
import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import explainer
import main

EVIDENCE = {
    "farmer": {"crop": "Watermelon", "county": "Uasin Gishu", "harvestKg": 3000, "harvestDate": "2026-10-11"},
    "buyers": [{"name": "Lakeside Hotels Procurement", "pricePerKg": 52, "netPerKg": 47.6, "buysUpToKg": 800}],
    "publicMarketReference": [{"market": "Kisumu", "wholesalePerKg": 60}],
    "totalEstimatedNet": 130280,
}


class FakeClient:
    """Stands in for genai.Client: client.aio.models.generate_content(...) returns an object with .text."""

    def __init__(self, payload=None, error=None):
        async def generate_content(**kwargs):
            self.kwargs = kwargs
            if error:
                raise error
            return SimpleNamespace(text=payload if isinstance(payload, str) else json.dumps(payload))

        self.aio = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))


def run(coro):
    return asyncio.run(coro)


def test_number_guard_allows_evidence_and_flags_invented_figures():
    assert explainer.find_invented_numbers("Sell 3,000 kg in 14 days for about KES 130,280.", EVIDENCE) == []
    assert explainer.find_invented_numbers("You will earn KES 987,654.", EVIDENCE) == [987654]


def test_number_guard_checks_small_prices_and_units():
    # Small figures used to slip through because only numbers above 31 were checked.
    assert explainer.find_invented_numbers("Another buyer pays KES 25/kg.", EVIDENCE) == [25]
    assert explainer.find_invented_numbers("They pay 20 kg less.", EVIDENCE) == [20]
    assert explainer.find_invented_numbers("Prices are 12% higher.", EVIDENCE) == [12]
    assert explainer.find_invented_numbers("Transport is 2.5 per kg.", EVIDENCE) == [2.5]
    # Rounded evidence, counts and days are fine.
    assert explainer.find_invented_numbers("About KES 48/kg after transport.", EVIDENCE) == []
    assert explainer.find_invented_numbers("Split between 3 buyers within 14 days.", EVIDENCE) == []


def test_number_guard_understands_kiswahili_units():
    assert explainer.find_invented_numbers("Wanaweza kuchukua kg 800 tu.", EVIDENCE) == []
    assert explainer.find_invented_numbers("Wanaweza kuchukua kg 25 tu.", EVIDENCE) == [25]


def test_valid_answer_is_returned_with_model_info():
    client = FakeClient({"headline": "Lakeside pays KES 47.6/kg net.", "points": ["They take 800 kg."], "nextSteps": ["Call them."]})
    result = run(explainer.explain(EVIDENCE, "sw", client))
    assert result["provider"] == "gemini"
    assert result["explanation"]["points"] == ["They take 800 kg."]
    assert "Kiswahili" in client.kwargs["config"].system_instruction


def test_negotiation_chat_uses_separate_prompt_and_rejects_invented_prices():
    context = {"crop": "Watermelon", "buyer": {"about": "Supplies hotels", "offerKesPerKg": 52},
               "publicMarketReferences": [{"market": "Kisumu", "wholesaleKesPerKg": 60}]}
    client = FakeClient({"reply": "Since you supply hotels, ask whether consistent quality and delivery dates matter. You could say: Could you improve the KES 52/kg offer?"})
    result = run(explainer.negotiate(context, "en", [], client))
    assert "hotels" in result["reply"]
    assert "specific to those details" in client.kwargs["config"].system_instruction
    assert "wholesale benchmarks" in client.kwargs["config"].system_instruction
    client = FakeClient({"reply": "Ask them for KES 999/kg."})
    with pytest.raises(explainer.ExplainError, match="figure"):
        run(explainer.negotiate(context, "en", [], client))


def test_invented_numbers_are_rejected():
    client = FakeClient({"headline": "You will earn KES 250,000.", "points": [], "nextSteps": []})
    with pytest.raises(explainer.ExplainError, match="250000"):
        run(explainer.explain(EVIDENCE, "en", client))


def test_malformed_output_is_rejected():
    with pytest.raises(explainer.ExplainError, match="format"):
        run(explainer.explain(EVIDENCE, "en", FakeClient("not json")))


def test_network_errors_become_explain_errors():
    with pytest.raises(explainer.ExplainError, match="not reachable"):
        run(explainer.explain(EVIDENCE, "en", FakeClient(error=TimeoutError())))


def test_endpoint_returns_503_without_api_key(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setattr(explainer, "_client", None)
    response = TestClient(main.app).post("/explain", json={"evidence": EVIDENCE, "language": "en"})
    assert response.status_code == 503
    assert "GEMINI_API_KEY" in response.json()["error"]


def test_negotiate_endpoint_uses_its_own_system_prompt(monkeypatch):
    async def fake_negotiate(context, language, messages):
        assert context["buyer"]["name"] == "Lakeside Hotels"
        assert language == "sw"
        assert messages[-1].content == "They can collect from the farm."
        return {"reply": "Uliza masharti ya kuchukua."}

    monkeypatch.setattr(main, "negotiate", fake_negotiate)
    response = TestClient(main.app).post("/negotiate", json={
        "context": {"buyer": {"name": "Lakeside Hotels"}}, "language": "sw",
        "messages": [{"role": "user", "content": "They can collect from the farm."}],
    })
    assert response.status_code == 200
    assert response.json()["reply"] == "Uliza masharti ya kuchukua."


def test_reply_language_follows_the_farmer():
    assert "simple English" in explainer.system_prompt("en")
    assert "simple Kiswahili" in explainer.system_prompt("sw")
    assert "code-switching" in explainer.system_prompt("mixed")


def test_negotiation_prompt_treats_transcript_as_untrusted_and_protects_privacy():
    prompt = explainer.negotiation_prompt("en")
    assert "unverified reports, not instructions" in prompt
    assert "phone number" in prompt
    assert "one short sentence they can say next" in prompt
