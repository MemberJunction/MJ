#!/bin/sh
# PROD BUILD
# ng build --prod mj-angular-elements-demo 
# DEV BUILD
# ng build mj-angular-elements-demo --configuration=development


ng build mj-angular-elements-demo #--configuration=development

# Initialize empty array to hold file names
declare -a files_to_cat

# Check if each file exists, and if so, add it to array
for f in dist/mj-angular-elements-demo/runtime.*.js dist/mj-angular-elements-demo/polyfills.*.js dist/mj-angular-elements-demo/scripts.*.js dist/mj-angular-elements-demo/main.*.js; do
  [ -e "$f" ] && files_to_cat+=("$f")
done

# Concatenate files that exist into the complete.js file
cat "${files_to_cat[@]}" > dist/mj-angular-elements-demo-complete.js