import asyncio
import json
from datetime import date, timedelta
from types import SimpleNamespace

import pytest

import explainer
import extractor

OPTIONS = {"crops": ["maize", "tomato", "watermelon"], "counties": ["Trans Nzoia", "Kisumu", "Uasin Gishu"], "businessTypes": ["reseller", "wholesaler"]}
NEXT_WEEK = (date.today() + timedelta(days=7)).isoformat()


class FakeClient:
    def __init__(self, payload):
        async def generate_content(**kwargs):
            self.kwargs = kwargs
            return SimpleNamespace(text=json.dumps(payload))
        self.aio = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))


def harvest(**overrides):
    base = {"transcript": None, "crop": "maize", "place": "Kitale", "county": "Trans Nzoia", "quantity": {"amount": 30, "unit": "bag"}, "harvestDate": NEXT_WEEK, "unclear": []}
    return {**base, **overrides}


def run(coro):
    return asyncio.run(coro)


def test_harvest_from_words_is_extracted_without_converting_units():
    client = FakeClient(harvest())
    result = run(extractor.extract_harvest(OPTIONS, text="Nina magunia thelathini ya mahindi Kitale, nitavuna wiki ijayo", client=client))
    assert result["extraction"]["quantity"] == {"amount": 30, "unit": "bag"}
    assert result["extraction"]["harvestDate"] == NEXT_WEEK
    assert "TODAY:" in client.kwargs["contents"][0]


def test_quantity_not_in_the_digits_said_is_rejected():
    client = FakeClient(harvest(quantity={"amount": 50, "unit": "bag"}))
    with pytest.raises(explainer.ExplainError, match="wasn't said"):
        run(extractor.extract_harvest(OPTIONS, text="I have 30 bags of maize", client=client))


def test_thousands_shorthand_is_accepted():
    client = FakeClient(harvest(quantity={"amount": 3000, "unit": "kg"}))
    assert run(extractor.extract_harvest(OPTIONS, text="3k kg za mahindi", client=client))["extraction"]["quantity"]["amount"] == 3000


def test_voice_is_checked_against_its_transcript():
    client = FakeClient(harvest(transcript="nina magunia 30 ya mahindi", quantity={"amount": 40, "unit": "bag"}))
    with pytest.raises(explainer.ExplainError):
        run(extractor.extract_harvest(OPTIONS, audio=b"fake-audio", mime_type="audio/webm;codecs=opus", client=client))


def test_impossible_dates_are_dropped():
    client = FakeClient(harvest(harvestDate="1999-01-01"))
    assert run(extractor.extract_harvest(OPTIONS, text="mahindi", client=client))["extraction"]["harvestDate"] is None


def test_listing_from_whatsapp_message():
    payload = {"businessName": "Kibuye Fresh Traders", "businessType": "wholesaler", "crop": "tomato", "price": {"amount": 80, "per": "kg"},
               "quantity": {"amount": 500, "unit": "kg"}, "frequency": "weekly", "place": "Kibuye", "county": "Kisumu", "collectsFromFarm": True,
               "neededFrom": None, "neededUntil": None, "description": "Tomato wholesaler", "unclear": []}
    client = FakeClient(payload)
    result = run(extractor.extract_listing(OPTIONS, "Tunanunua nyanya kg 500 kila wiki, bei 80. Kibuye Kisumu, tunakuja shambani.", client=client))
    assert result["extraction"]["price"] == {"amount": 80, "per": "kg"}
    assert "untrusted" in client.kwargs["contents"][1]


def test_listing_with_invented_price_is_rejected():
    payload = {"businessName": None, "businessType": None, "crop": "tomato", "price": {"amount": 120, "per": "kg"}, "quantity": None, "frequency": None,
               "place": None, "county": None, "collectsFromFarm": None, "neededFrom": None, "neededUntil": None, "description": None, "unclear": []}
    with pytest.raises(explainer.ExplainError):
        run(extractor.extract_listing(OPTIONS, "Tunanunua nyanya kg 500, bei 80", client=FakeClient(payload)))
