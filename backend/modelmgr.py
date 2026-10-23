"""Model lifecycle manager.

Every heavyweight model is registered here with a loader, an unloader and an
idle TTL.  Models load lazily on first use and are automatically unloaded
after `idle_ttl` seconds without use, freeing RAM for whatever runs next.
A `protect` context is used while a model is actively generating so a sweep
can never unload it mid-request.
"""

from __future__ import annotations

import gc
import logging
import os
import threading
import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any, Callable

log = logging.getLogger("modelmgr")

try:  # psutil is optional; fall back to /proc on Linux, None elsewhere
    import psutil  # type: ignore

    _PROC: Any = psutil.Process()
except Exception:
    _PROC = None


def _rss_mb() -> float | None:
    if _PROC is not None:
        try:
            return round(_PROC.memory_info().rss / (1024 * 1024), 1)
        except Exception:
            return None
    try:
        with open("/proc/self/statm") as f:
            pages = int(f.read().split()[1])
        return round(pages * os.sysconf("SC_PAGE_SIZE") / (1024 * 1024), 1)
    except Exception:
        return None


@dataclass
class Engine:
    name: str
    loader: Callable[[], Any]
    unloader: Callable[[Any], None]
    idle_ttl: float = 600.0
    model_info: str = ""
    resident: bool = False          # resident engines are warmed and kept
    keep_loaded: bool = False       # manual pin (never auto-unloaded)

    _lock: threading.RLock = field(default_factory=threading.RLock, repr=False)
    handle: Any = None
    last_used: float = 0.0
    loading: bool = False
    loads: int = 0
    unloads: int = 0
    load_time: float | None = None


class ModelManager:
    def __init__(self) -> None:
        self._engines: dict[str, Engine] = {}
        self._registry_lock = threading.Lock()
        self._stop = threading.Event()
        self._sweeper: threading.Thread | None = None

    # -- registry ---------------------------------------------------------
    def register(self, engine: Engine) -> None:
        with self._registry_lock:
            self._engines[engine.name] = engine
        if engine.resident:
            threading.Thread(
                target=self._quiet_load, args=(engine.name,), daemon=True
            ).start()

    def _quiet_load(self, name: str) -> None:
        try:
            self.get(name)
        except Exception:
            log.exception("warm load failed for %s", name)

    def get(self, name: str) -> Any:
        """Load (if needed) and return the model handle; marks use time."""
        eng = self._engines.get(name)
        if eng is None:
            raise KeyError(f"engine {name!r} not registered")
        with eng._lock:
            if eng.handle is None:
                eng.loading = True
                t0 = time.time()
                try:
                    eng.handle = eng.loader()
                finally:
                    eng.loading = False
                eng.load_time = round(time.time() - t0, 2)
                eng.loads += 1
                log.info("loaded %s in %.2fs", name, eng.load_time)
            eng.last_used = time.time()
            return eng.handle

    @contextmanager
    def protect(self, name: str):
        """Hold an engine while in use so the sweeper won't unload it."""
        eng = self._engines[name]
        with eng._lock:
            eng.last_used = time.time()
            yield eng.handle
            eng.last_used = time.time()

    def peek(self, name: str) -> Any | None:
        eng = self._engines.get(name)
        return eng.handle if eng else None

    def is_ready(self, name: str) -> bool:
        eng = self._engines.get(name)
        return bool(eng and eng.handle is not None)

    def unload(self, name: str, reason: str = "manual") -> bool:
        eng = self._engines.get(name)
        if eng is None:
            return False
        with eng._lock:
            if eng.handle is None:
                return False
            if eng.resident or eng.keep_loaded:
                return False
            try:
                eng.unloader(eng.handle)
            except Exception:
                log.exception("unload failed for %s", name)
            eng.handle = None
            eng.unloads += 1
            eng.load_time = None
        gc.collect()
        log.info("unloaded %s (%s)", name, reason)
        return True

    # -- sweeping ---------------------------------------------------------
    def start_sweeper(self, interval: float = 20.0) -> None:
        if self._sweeper:
            return
        self._sweeper = threading.Thread(
            target=self._sweep_loop, args=(interval,), daemon=True
        )
        self._sweeper.start()

    def _sweep_loop(self, interval: float) -> None:
        while not self._stop.wait(interval):
            try:
                self.sweep_once()
            except Exception:
                log.exception("sweep failed")

    def sweep_once(self) -> list[str]:
        now = time.time()
        unloaded = []
        for name, eng in list(self._engines.items()):
            if eng.resident or eng.keep_loaded:
                continue
            with eng._lock:
                if eng.handle is None:
                    continue
                if eng.loading:
                    continue
                # last_used is refreshed by protect() while generating
                if now - eng.last_used > eng.idle_ttl:
                    try:
                        eng.unloader(eng.handle)
                    except Exception:
                        log.exception("sweep unload failed for %s", name)
                    eng.handle = None
                    eng.unloads += 1
                    eng.load_time = None
                    unloaded.append(name)
        if unloaded:
            gc.collect()
            log.info("idle-unloaded: %s", ", ".join(unloaded))
        return unloaded

    # -- status -----------------------------------------------------------
    def status(self) -> dict:
        engines = {}
        for name, eng in self._engines.items():
            idle_for = (
                round(time.time() - eng.last_used) if eng.last_used else None
            )
            engines[name] = {
                "loaded": eng.handle is not None,
                "loading": eng.loading,
                "info": eng.model_info,
                "load_time_s": eng.load_time,
                "idle_ttl_s": eng.idle_ttl,
                "idle_for_s": idle_for,
                "loads": eng.loads,
                "unloads": eng.unloads,
                "resident": eng.resident,
            }
        return {"engines": engines, "rss_mb": _rss_mb()}

    def stop(self) -> None:
        self._stop.set()


manager = ModelManager()
