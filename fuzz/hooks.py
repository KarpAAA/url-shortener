"""Schemathesis hooks (loaded through SCHEMATHESIS_HOOKS)."""

from typing import Any

import schemathesis


@schemathesis.hook
def before_call(context: Any, case: Any, kwargs: dict[str, Any]) -> None:
    """Do not follow redirects.

    `GET /{code}` answers 302 to an arbitrary, fuzzed destination. The 302 itself is the
    response under test; following it would send requests to third-party hosts and check
    their responses against this API's schema.
    """
    kwargs["allow_redirects"] = False
