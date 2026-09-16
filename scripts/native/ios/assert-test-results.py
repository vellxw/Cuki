#!/usr/bin/env python3
"""Validate XCTest results, not an xcodebuild/simctl launch exit code alone."""
import json
from pathlib import Path
import sys

summary = json.loads(Path(sys.argv[1]).read_text())
# xccresulttool get test-results summary returns concrete counts on supported Xcode.
assert summary.get('totalTestCount', 0) > 0, 'No native UI tests executed'
assert summary.get('failedTests', 0) == 0, 'Native UI failures'
assert summary.get('passedTests', 0) > 0, 'No native UI tests passed'
assert summary.get('skippedTests', 0) == 0, 'The required native flow was skipped'
assert summary.get('result') == 'Passed', 'Native UI result is not Passed'
print('Native XCTest flow verified:', summary['passedTests'], 'passed')
