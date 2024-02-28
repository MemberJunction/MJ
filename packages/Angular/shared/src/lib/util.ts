import * as KendoSVGIcons from "@progress/kendo-svg-icons";

export function kendoSVGIcon(iconName: string) {
    // Cast KendoSVGIcons to any to bypass the index signature check
    try {
      const lookupName: string = iconName.endsWith('Icon') ? iconName : iconName + 'Icon';
      const icon = (KendoSVGIcons as any)[lookupName];
      if (!icon)
        console.log('Icon not found: ' + iconName)
      
      return icon || null;  
    }
    catch (e) {
      // icon not found
      console.log('Icon not found: ' + iconName)
      return null;
    }
  }