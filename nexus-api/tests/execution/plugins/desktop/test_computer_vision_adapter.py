import pytest
from unittest.mock import MagicMock, patch, call
from app.execution.plugins.desktop.drivers.base import LocatorCandidate


def _patch_cv_deps(patcher_ctx, ocr_data=None, match_val=0.9, match_loc=(10, 20)):
    """Patch mss, pytesseract, cv2, pyautogui, PIL, subprocess, numpy inside a context."""
    import sys

    # PIL Image mock
    mock_image = MagicMock()
    mock_image.save = MagicMock()
    mock_image.convert = MagicMock(return_value=mock_image)

    # mss mock
    mock_sct = MagicMock()
    mock_screenshot = MagicMock()
    mock_screenshot.size = (1920, 1080)
    mock_screenshot.bgra = b"BGRA" * (1920 * 1080)
    mock_sct.__enter__ = MagicMock(return_value=mock_sct)
    mock_sct.__exit__ = MagicMock(return_value=False)
    mock_sct.monitors = [{"left": 0, "top": 0, "width": 1920, "height": 1080}]
    mock_sct.grab = MagicMock(return_value=mock_screenshot)
    mock_mss = MagicMock()
    mock_mss.mss = MagicMock(return_value=mock_sct)

    # pytesseract mock
    mock_tess = MagicMock()
    mock_tess.Output = MagicMock()
    mock_tess.Output.DICT = "dict"
    if ocr_data is None:
        ocr_data = {
            "text": ["Submit", "Cancel"],
            "conf": [90, 85],
            "left": [100, 200],
            "top": [50, 50],
            "width": [60, 60],
            "height": [20, 20],
        }
    mock_tess.image_to_data = MagicMock(return_value=ocr_data)

    # cv2 mock
    mock_cv2 = MagicMock()
    mock_np_result = MagicMock()
    mock_cv2.matchTemplate = MagicMock(return_value=mock_np_result)
    mock_cv2.minMaxLoc = MagicMock(return_value=(0.0, match_val, None, match_loc))
    mock_cv2.TM_CCOEFF_NORMED = 5
    mock_cv2.COLOR_RGB2GRAY = 6
    mock_cv2.cvtColor = MagicMock(return_value=MagicMock())
    mock_cv2.imread = MagicMock(return_value=MagicMock(shape=(30, 80)))
    mock_cv2.IMREAD_GRAYSCALE = 0

    # numpy mock
    mock_np = MagicMock()
    mock_np.array = MagicMock(return_value=MagicMock())

    # PIL mock
    mock_pil_image = MagicMock()
    mock_pil_image.frombytes = MagicMock(return_value=mock_image)
    mock_pil = MagicMock()
    mock_pil.Image = mock_pil_image

    # pyautogui mock
    mock_pyautogui = MagicMock()

    return {
        "mss": mock_mss,
        "pytesseract": mock_tess,
        "cv2": mock_cv2,
        "numpy": mock_np,
        "PIL": mock_pil,
        "pyautogui": mock_pyautogui,
        "_image": mock_image,
        "_sct": mock_sct,
    }


@pytest.mark.asyncio
async def test_report_capabilities():
    mocks = _patch_cv_deps(None)
    with patch.dict("sys.modules", mocks):
        from importlib import reload
        import app.execution.plugins.desktop.drivers.computer_vision as mod
        reload(mod)
        adapter = mod.ComputerVisionAdapter()
        caps = await adapter.report_capabilities()

    assert caps["driver"] == "computer_vision"
    assert caps["requires_server"] is False
    assert caps["ocr"] is True
    assert caps["visual_matching"] is True


@pytest.mark.asyncio
async def test_screenshot_returns_bytes():
    import io
    mocks = _patch_cv_deps(None)
    fake_bytes = b"\x89PNG_FAKE"

    def fake_save(buf, format=None):
        buf.write(fake_bytes)

    mocks["_image"].save = fake_save

    with patch.dict("sys.modules", mocks):
        from importlib import reload
        import app.execution.plugins.desktop.drivers.computer_vision as mod
        reload(mod)
        adapter = mod.ComputerVisionAdapter()
        result = await adapter.screenshot()

    assert result.success is True
    assert result.screenshot_bytes == fake_bytes


@pytest.mark.asyncio
async def test_find_element_by_ocr_success():
    ocr_data = {
        "text": ["Submit", "Cancel"],
        "conf": [90, 85],
        "left": [100, 200],
        "top": [50, 50],
        "width": [60, 60],
        "height": [20, 20],
    }
    mocks = _patch_cv_deps(None, ocr_data=ocr_data)

    with patch.dict("sys.modules", mocks):
        from importlib import reload
        import app.execution.plugins.desktop.drivers.computer_vision as mod
        reload(mod)
        adapter = mod.ComputerVisionAdapter()
        candidates = [LocatorCandidate(strategy="ocr", value="Submit", confidence=0.9)]
        result = await adapter.find_element(candidates)

    assert result.success is True
    assert result.metadata["x"] == 130   # left(100) + width(60)//2
    assert result.metadata["y"] == 60    # top(50) + height(20)//2


@pytest.mark.asyncio
async def test_find_element_by_ocr_not_found():
    ocr_data = {
        "text": ["Cancel"],
        "conf": [85],
        "left": [200],
        "top": [50],
        "width": [60],
        "height": [20],
    }
    mocks = _patch_cv_deps(None, ocr_data=ocr_data)

    with patch.dict("sys.modules", mocks):
        from importlib import reload
        import app.execution.plugins.desktop.drivers.computer_vision as mod
        reload(mod)
        adapter = mod.ComputerVisionAdapter()
        candidates = [LocatorCandidate(strategy="ocr", value="Submit", confidence=0.9)]
        result = await adapter.find_element(candidates)

    assert result.success is False


@pytest.mark.asyncio
async def test_find_element_by_visual_match():
    mocks = _patch_cv_deps(None, match_val=0.92, match_loc=(50, 100))

    with patch.dict("sys.modules", mocks):
        from importlib import reload
        import app.execution.plugins.desktop.drivers.computer_vision as mod
        reload(mod)
        adapter = mod.ComputerVisionAdapter()
        candidates = [
            LocatorCandidate(strategy="visual", value="/path/to/btn.png", confidence=0.8)
        ]
        result = await adapter.find_element(candidates)

    assert result.success is True
    # center = match_loc(50,100) + template_size(80,30)//2 = (90, 115)
    assert result.metadata["x"] == 90
    assert result.metadata["y"] == 115


@pytest.mark.asyncio
async def test_find_element_visual_below_threshold():
    mocks = _patch_cv_deps(None, match_val=0.5)  # below 0.8 threshold

    with patch.dict("sys.modules", mocks):
        from importlib import reload
        import app.execution.plugins.desktop.drivers.computer_vision as mod
        reload(mod)
        adapter = mod.ComputerVisionAdapter()
        candidates = [
            LocatorCandidate(strategy="visual", value="/path/to/btn.png", confidence=0.8)
        ]
        result = await adapter.find_element(candidates)

    assert result.success is False


@pytest.mark.asyncio
async def test_click_by_ocr_calls_pyautogui():
    ocr_data = {
        "text": ["OK"],
        "conf": [95],
        "left": [300],
        "top": [200],
        "width": [40],
        "height": [20],
    }
    mocks = _patch_cv_deps(None, ocr_data=ocr_data)

    with patch.dict("sys.modules", mocks):
        from importlib import reload
        import app.execution.plugins.desktop.drivers.computer_vision as mod
        reload(mod)
        adapter = mod.ComputerVisionAdapter()
        candidates = [LocatorCandidate(strategy="ocr", value="OK", confidence=0.9)]
        result = await adapter.click(candidates)

    assert result.success is True
    mocks["pyautogui"].click.assert_called_once_with(320, 210)  # 300+20, 200+10
