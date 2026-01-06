#!/usr/bin/env python3
"""
Escape JavaScript template literals in SQL migration files while preserving Flyway placeholders.

This script escapes ${...} patterns that are NOT Flyway placeholders (like ${flyway:defaultSchema})
by converting them to $${...} so Flyway doesn't try to substitute them.
"""

import sys
import re

def escape_placeholders(content):
    """
    Escape ${...} patterns except for ${flyway:...} placeholders.

    Strategy:
    1. Find all ${...} patterns
    2. Check if they start with ${flyway:
    3. If not, escape by doubling EACH $ in the sequence

    Special handling for $$${...} patterns:
    - These are JavaScript template literals with a dollar sign output
    - Need to escape to $$$$${...} so Flyway converts to $${...}
    """
    # Flyway interprets $$ as a single escaped $, so:
    # - $${x} becomes $ + {x} (placeholder!) - NOT what we want
    # - $$$${x} becomes $$ + {x} (literal $$, no placeholder) - WRONG
    # - $$$$${x} becomes $$$ + literal ${x} - CORRECT!
    #
    # So we need to add 4 dollars before EVERY { in a placeholder

    # First, handle $${...} (not flyway) - needs 2 more dollars
    # $${x} → $$$$$${x} (6 total) so Flyway outputs $$${x}
    pattern_double = r'\$\$\{(?!flyway:)'
    result = re.sub(pattern_double, '$$$$$${', content)

    # Then handle regular ${...} (not flyway) patterns - needs 3 more dollars
    # ${x} → $$$${x} (4 total) so Flyway outputs $${x}
    pattern_single = r'(?<!\$)\$\{(?!flyway:)'
    result = re.sub(pattern_single, '$$$${', result)

    return result

def main():
    if len(sys.argv) != 3:
        print("Usage: python3 escape-flyway-placeholders.py <input_file> <output_file>")
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2]

    print(f"Reading {input_file}...")
    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()

    print("Processing placeholders...")

    # Count placeholders before
    before_count = len(re.findall(r'\$\{', content))
    flyway_count = len(re.findall(r'\$\{flyway:', content))

    result = escape_placeholders(content)

    # Count after
    after_dollar = result.count('${')
    after_escaped = result.count('$${')

    print(f"Before: {before_count} total placeholders ({flyway_count} Flyway placeholders)")
    print(f"After: {after_dollar} unescaped (Flyway), {after_escaped} escaped (JavaScript/other)")

    print(f"Writing {output_file}...")
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(result)

    print("Done!")

if __name__ == "__main__":
    main()
