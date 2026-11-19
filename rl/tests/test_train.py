from __future__ import annotations

import csv
from pathlib import Path

from lost_storm_rl.train import LOG_HEADER, open_log


def rows(path: Path) -> list[list[str]]:
    with path.open(newline="") as handle:
        return list(csv.reader(handle))


def test_a_new_log_starts_with_the_header(tmp_path: Path) -> None:
    path = tmp_path / "log.csv"
    open_log(path).close()
    assert rows(path) == [LOG_HEADER]


def test_a_log_with_the_same_header_is_appended_to(tmp_path: Path) -> None:
    path = tmp_path / "log.csv"
    with open_log(path) as log_file:
        csv.writer(log_file).writerow(["1"] * len(LOG_HEADER))
    with open_log(path) as log_file:
        csv.writer(log_file).writerow(["2"] * len(LOG_HEADER))
    assert rows(path) == [LOG_HEADER, ["1"] * len(LOG_HEADER), ["2"] * len(LOG_HEADER)]
    assert not (tmp_path / "log-1.csv").exists()


def test_a_log_with_an_older_header_is_set_aside(tmp_path: Path) -> None:
    path = tmp_path / "log.csv"
    old = [LOG_HEADER[:13], ["1"] * 13]
    with path.open("w", newline="") as handle:
        csv.writer(handle).writerows(old)
    (tmp_path / "log-1.csv").write_text("kept\n")
    open_log(path).close()
    assert rows(path) == [LOG_HEADER]
    assert rows(tmp_path / "log-2.csv") == old
    assert (tmp_path / "log-1.csv").read_text() == "kept\n"
