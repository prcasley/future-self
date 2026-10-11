import pytest

from apps.api import main


@pytest.fixture(autouse=True)
def no_leftover_outage():
    """A simulated Nebius outage in one test must not pause free conversation in the next."""
    main.provider_down[0] = 0.0
    yield
    main.provider_down[0] = 0.0
