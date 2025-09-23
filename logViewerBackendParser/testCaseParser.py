import re
import json

def make_contains_regex(text):
    """Escapes and compiles a regex that matches the given text (case-insensitive)."""
    return re.compile(re.escape(text), re.IGNORECASE) if text else None

def extract_test_cases(block_lines):
    """Extract test case start/end info and timestamps."""
    test_start_pattern = re.compile(r'(\w+)\s+test start.*', re.IGNORECASE)
    test_end_pattern = re.compile(r'(\w+)\s+test end.*', re.IGNORECASE)
    time_pattern = re.compile(r'(\d{2}:\d{2}:\d{2})')

    pending_tests = []
    test_cases = []

    for line_num, line in enumerate(block_lines):
        start_match = test_start_pattern.search(line)
        if start_match:
            test_name = start_match.group(1)
            if test_name.lower() != 'test_executor':
                start_time = time_pattern.search(line)
                pending_tests.append({
                    'test_name': test_name,
                    'start_line': line_num,
                    'start_time': start_time.group(1) if start_time else None
                })

        end_match = test_end_pattern.search(line)
        if end_match:
            end_test_name = end_match.group(1)
            end_time = time_pattern.search(line)
            for test in pending_tests:
                if test["test_name"] == end_test_name and "end_line" not in test:
                    test["end_line"] = line_num
                    test["end_time"] = end_time.group(1) if end_time else None
                    test_cases.append(test)
                    break

    # Handle unmatched test starts
    for test in pending_tests:
        if "end_line" not in test:
            test["end_line"] = None
            test["end_time"] = None
            test_cases.append(test)

    return test_cases


def extract_result_section(block_lines, result_start, result_end):
    """Locate result section lines based on configured start and end strings."""
    start_pattern = make_contains_regex(result_start)
    end_pattern = make_contains_regex(result_end)
    start_idx, end_idx = None, None
    for i, line in enumerate(block_lines):
        if start_pattern and start_pattern.search(line):
            start_idx = i
        elif end_pattern and end_pattern.search(line) and start_idx is not None:
            end_idx = i
            break

    # Use partial or full fallback if needed
    if start_idx is not None and end_idx is not None:
        return block_lines[start_idx:end_idx]
    elif start_idx is not None:
        return block_lines[start_idx:]
    elif end_idx is not None:
        return block_lines[:end_idx]
    else:
        return block_lines  # fallback to entire block


def match_tests_with_results(test_cases, result_section_lines):
    output = []
    test_occurrence_counter = {}

    for test_case, result in zip(test_cases, result_section_lines):
        if test_case['test_name'] == result['test_name']:
            output.append({
                'test_name': test_case['test_name'],
                'status': result['status'],
                'line_number': test_case['line_number'],
                'end_line_number': test_case.get('end_line_number'),
                'start_time': test_case.get('start_time'),
                'end_time': test_case.get('end_time')
            })
            continue
        elif test_case['test_name'].lower() == 'endtest':
            output.append({
                'test_name': test_case['test_name'],
                'status': 'PASS',
                'line_number': test_case['line_number'],
                'end_line_number': test_case.get('end_line_number'),
                'start_time': test_case.get('start_time'),
                'end_time': test_case.get('end_time')
            })
            continue
        else:
            if not test_case['test_name'] == result['test_name']:
                raise ValueError(f"No matching result found for test case '{test_case['test_name']}'")

    return output


def parse_test_block(block_lines, result_start, result_end, subtest_results):
    time_pattern = re.compile(r'(\d{2}:\d{2}:\d{2})')
    used_lines = set()
    test_cases = []

    for subtest in subtest_results:
        test_name = subtest.get("test_name")

        # Dynamically create start and end patterns
        start_pattern = re.compile(rf'test start', re.IGNORECASE)
        test_start_pattern = re.compile(rf'{re.escape(test_name)}\s+test\s+start', re.IGNORECASE)
        name_pattern = re.compile(rf'NAME="{re.escape(test_name)}"\s*', re.IGNORECASE)
        executing_pattern = re.compile(rf'executing\s+{re.escape(test_name)}\s*$', re.IGNORECASE)
        test_begin_pattern = re.compile(rf'test {re.escape(test_name)}: begin', re.IGNORECASE)
        end_pattern = re.compile(rf'test end', re.IGNORECASE)

        start_info = None
        end_info = None
        block_start = None
        block_end = None

        # Find test start line
        for i, line in enumerate(block_lines):
            if i in used_lines:
                continue
            if test_begin_pattern.search(line) or executing_pattern.search(line) or name_pattern.search(line) or test_start_pattern.search(line):
                for j in range(i, -1, -1):
                    if start_pattern.search(block_lines[j]) and time_pattern.search(block_lines[j]):
                        time_match = time_pattern.search(block_lines[j])
                        start_info = {
                            "start_line": j,
                            "start_time": time_match.group(1) if time_match else None
                        }
                        block_start = j
                        break
                break

        # Find test end line
        for i, line in enumerate(block_lines):
            if i in used_lines:
                continue
            if end_pattern.search(line):
                time_match = time_pattern.search(line)
                end_info = {
                    "end_line": i,
                    "end_time": time_match.group(1) if time_match else None
                }
                block_end = i
                break
        
        if not block_start:
            continue
        
        used_lines.update(list(range(block_start, block_end+1)))

        if not used_lines:
            break

        test_case = {
            "test_name": test_name,
            "line_number": start_info["start_line"] if start_info else None,
            "start_time": start_info["start_time"] if start_info else None,
            "end_line_number": end_info["end_line"] if end_info else None,
            "end_time": end_info["end_time"] if end_info else None,
        }

        test_cases.append(test_case)

    if test_cases:
        return match_tests_with_results(test_cases, subtest_results), subtest_results[-1]['status']
    return [], None


def extract_summary_tests(summary_block_lines):
    """Extract _f_% style test names from Summary block lines."""
    summary_f_pattern = re.compile(r'_f_\w+')
    time_pattern = re.compile(r'(\d{2}:\d{2}:\d{2})')
    found_tests = []
    test_names = []

    for line in summary_block_lines:
        match_f_pattern = summary_f_pattern.search(line)
        match_time = time_pattern.search(line)
        if match_f_pattern and match_time:
            found_tests.append([match_f_pattern.group(0), match_time.group(0)])
            test_names.append(match_f_pattern.group(0))

    return found_tests, test_names

def parse_last_pass_fail(final_test_block):
    for line in final_test_block:
        if 'errorid' in line.lower():
            return True
    return False

def parse_structured_result_table(lines):
    pattern = re.compile(
        r'^(\S+)\s+'                # Test name (non-space characters)
        r'([A-Z]+(?::[A-Z]+)?)\s+' # Status (e.g. PASS or FAIL:SANITIZED)
        r'([0-9]*\.?[0-9]+)\s+'    # Duration (float)
        r'(-?\d+)\s*$'             # Error code (integer, allow negative)
        , re.IGNORECASE)

    last_block = []
    current_block = []
    inside_block = False

    for i, line in enumerate(lines):
        line_stripped = line.strip()
        match = pattern.match(line_stripped)

        if match:
            # Check if this is the start of a new block:
            if i == 0:
                current_block = []
                inside_block = True
            else:
                prev_line = lines[i - 1].strip()
                # Check previous line all non-alnum and not empty
                if prev_line and all(not c.isalnum() for c in prev_line):
                    if current_block:
                        last_block = current_block
                    current_block = []
                    inside_block = True
                elif not inside_block:
                    # We're not inside a block, skip adding
                    continue

            test_name, status, duration, error_code = match.groups()
            if status.upper() != 'DISABLED':
                current_block.append({
                    'test_name': test_name,
                    'status': status.upper(),
                    'duration': float(duration),
                    'error_code': int(error_code)
                })

        else:
            # Non-matching line breaks block
            inside_block = False

    if current_block:
        last_block = current_block

    return last_block

def parse_log(log_path):
    """Parse structured test log using summary _f_ markers and banner-based block detection."""

    with open(log_path, 'r') as f:
        log_lines = f.readlines()

    summary_start_pattern = re.compile(r'\bTest_Start\b', re.IGNORECASE)
    summary_end_pattern = re.compile(r'\bCapture end\b', re.IGNORECASE)
    summary_f_pattern = re.compile(r'_f_\w+')
    time_pattern = re.compile(r'(\d{2}:\d{2}:\d{2})')

    def is_banner(lines, idx, start_time):
        """Check if lines[idx-2] to lines[idx] form a 3-line banner box with correct start time in middle line."""
        if idx < 2:
            return False

        top = lines[idx - 2].strip()
        middle = lines[idx - 1].strip()
        bottom = lines[idx].strip()

        # Check top and bottom lines are all '#'
        if not (top.startswith("#") and all(c == "#" for c in top)):
            return False
        if not (bottom.startswith("#") and all(c == "#" for c in bottom)):
            return False

        # Middle line must start and end with '#', have non-space content, AND contain correct start time
        if not (middle.startswith("#") and middle.endswith("#")):
            return False
        middle_content = middle[1:-1].strip()
        if not middle_content:
            return False
        if start_time not in middle_content:
            return False

        return True

    # Step 1: Find summary block
    summary_start = summary_end = None
    for i, line in enumerate(log_lines):
        if summary_start is None and summary_start_pattern.search(line):
            summary_start = i
        elif summary_start is not None and summary_end_pattern.search(line):
            summary_end = i
            break

    if summary_start is None or summary_end is None:
        raise ValueError("Could not locate summary block.")

    summary_block = log_lines[summary_start:summary_end + 1]

    # Step 2: Extract _f_ test names
    summary_tests, summary_test_names = extract_summary_tests(summary_block)

    if not summary_tests:
        raise ValueError("No _f_ markers found in summary block.")

    all_results = []

    used_lines = set()
    
    for _f_block in summary_tests:
        test_name, test_start_time = _f_block
        tag_line = f"<{test_name}>"
        end_line = None

        for i, line in enumerate(log_lines):
            if i in used_lines:
                continue  # skip lines already used by a previous test
            if tag_line in line.strip():
                end_line = i
                break

        if end_line is None:
            print(f"Warning: <{test_name}> tag not found. Skipping.")
            continue

        # Find banner above
        start_line = None
        for i in range(end_line - 1, 1, -1):
            if i in used_lines or i - 2 in used_lines or i - 1 in used_lines:
                continue
            if is_banner(log_lines, i, test_start_time):
                start_line = i - 2
                break

        if start_line is None:
            print(f"Warning: 3-line banner not found before <{test_name}>. Skipping.")
            continue

        # Mark the lines as used
        for j in range(start_line, end_line + 1):
            used_lines.add(j)

        # Step 5: Parse block
        block = log_lines[start_line:end_line + 1]
        subtest_results = parse_structured_result_table(block)
        results, total_result = parse_test_block(block, block[1], block[-1], subtest_results)

        if results:
            # Attach the test name and compute absolute line numbers
            for r in results:
                if r['test_name'].lower() == 'total':
                    continue

                r["test_item"] = test_name
                r["absolute_line_number"] = start_line + r["line_number"]
                r["absolute_end_line_number"] = (
                    start_line + r["end_line_number"] if r["end_line_number"] is not None else None
                )
                del r["line_number"]
                del r["end_line_number"]

            all_results.extend(results)

            # Optionally, extract block start/end timestamps
            start_time_match = time_pattern.search(block[0]) if block else None
            end_time_match = time_pattern.search(block[-1]) if block else None

            # Add the parent test block result
            all_results.append({
                "test_item": test_name,
                "status": total_result,
                "has_subtests": True,
                "absolute_line_number": start_line,
                "absolute_end_line_number": end_line,
                "start_time": start_time_match.group(1) if start_time_match else None,
                "end_time": end_time_match.group(1) if end_time_match else None
            })
        else:
            # Fallback for blocks with no subtests: always PASS
            start_time_match = time_pattern.search(block[0]) if block else None
            end_time_match = time_pattern.search(block[-1]) if block else None

            all_results.append({
                "test_item": test_name,
                "status": "PASS",
                "has_subtests": False,
                "absolute_line_number": start_line,
                "absolute_end_line_number": end_line+1,
                "start_time": start_time_match.group(1) if start_time_match else None,
                "end_time": end_time_match.group(1) if end_time_match else None
            })
    
    if parse_last_pass_fail(log_lines[all_results[-1]['absolute_end_line_number']:summary_start]):
        all_results[-1]['status'] = "FAIL"

    # Step 6: Parse overall summary status

    summary_failed = any(
        res.get("test_item") in summary_test_names and res.get("status") == "FAIL"
        for res in all_results
    )

    all_results.append({
        "test_item": "Summary",
        "status": "FAIL" if summary_failed else "PASS",
        "absolute_line_number": summary_start-1,
        "absolute_end_line_number": summary_end,
        "start_time": None,
        "end_time": None
    })

    return all_results

if __name__ == '__main__':
    import sys
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: script.py <logfile>"}))
    else:
        results = parse_log(sys.argv[1])
        print(json.dumps(results, indent=2))
