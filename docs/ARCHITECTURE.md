# Architecture

The first prototype uses a React frontend and Express API. The API owns market data, transport assumptions, and deterministic calculations. An analysis adapter turns those results into a plain-language explanation. It currently uses a mock implementation and is the integration point for NVIDIA Brev inference.

```text
React client -> Express API -> market data + calculations -> analysis adapter
                                                     \-> NVIDIA AI service later
```

Keep numerical outputs deterministic and auditable. Use the model to explain trade-offs, uncertainty, and next steps rather than to invent prices or arithmetic.
