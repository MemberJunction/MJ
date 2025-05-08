#!/bin/sh

#################################################
# MemberJunction Angular Elements Build Script
#################################################
#
# This script builds the Angular Elements demo and bundles the output
# into a single JavaScript file that can be included in any web page.
#
# USAGE:
#   ./build_angular_elements.sh
#
# OUTPUT:
#   Creates a file at dist/mj-angular-elements-demo-complete.js
#   that contains all the necessary JavaScript for using the custom elements.
#
# The bundled file can be included in an HTML page with:
#   <script src="dist/mj-angular-elements-demo-complete.js"></script>
#
# After including this file, you can use the custom elements in your HTML:
#   <mj-hello-world></mj-hello-world>
#   <mj-entity-list-demo></mj-entity-list-demo>
#   <mj-entity-detail-demo></mj-entity-detail-demo>
#
#################################################

# Uncomment the appropriate build command for your environment
# For production builds
# ng build --prod mj-angular-elements-demo 

# For development builds
# ng build mj-angular-elements-demo --configuration=development

# Standard build (default configuration)
echo "Building Angular Elements demo..."
ng build mj-angular-elements-demo

# Bundle the output files into a single JavaScript file
echo "Bundling output files into a single JavaScript file..."

# Initialize empty array to hold file names
declare -a files_to_cat

# Check each file that Angular generates and include it in our bundle if it exists
# The order is important: runtime, polyfills, scripts, main
echo "Checking for output files..."
for f in dist/mj-angular-elements-demo/runtime.*.js dist/mj-angular-elements-demo/polyfills.*.js dist/mj-angular-elements-demo/scripts.*.js dist/mj-angular-elements-demo/main.*.js; do
  if [ -e "$f" ]; then
    echo "Found: $f"
    files_to_cat+=("$f")
  else
    echo "File not found (skipping): $f"
  fi
done

# Concatenate all files into a single JavaScript bundle
echo "Concatenating files into dist/mj-angular-elements-demo-complete.js..."
cat "${files_to_cat[@]}" > dist/mj-angular-elements-demo-complete.js

echo "Build complete! The bundled file is available at:"
echo "  dist/mj-angular-elements-demo-complete.js"
echo ""
echo "Include this file in any HTML page to use the custom elements:"
echo "  <script src=\"dist/mj-angular-elements-demo-complete.js\"></script>"
echo ""
echo "Then you can use the custom elements in your HTML:"
echo "  <mj-hello-world></mj-hello-world>"
echo "  <mj-entity-list-demo></mj-entity-list-demo>"
echo "  <mj-entity-detail-demo></mj-entity-detail-demo>"