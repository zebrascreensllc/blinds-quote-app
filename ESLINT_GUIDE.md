# ESLint & Unused Variables Management Guide

## 🚨 ESLint Error: `no-unused-vars`

This error occurs when you import or declare variables but don't use them.

```javascript
❌ WRONG:
import { unusedFunction } from './utils';
const unused = 'not used';

✅ RIGHT:
import { usedFunction } from './utils';
const used = 'I am used';
console.log(used);
```

---

## 🔧 Auto-Fix Unused Variables

### **Option 1: Use npm script**
```bash
npm run lint:fix
```

This automatically removes unused imports and fixes ESLint issues.

### **Option 2: Use bash script**
```bash
chmod +x scripts/cleanup-eslint.sh
./scripts/cleanup-eslint.sh
```

### **Option 3: Manual ESLint command**
```bash
npx eslint src --fix
```

---

## 💡 Tips for Avoiding Unused Variable Errors

### **1. Remove Unused Imports**
```javascript
❌ Removed (not used):
import { generateId, deepCopy, formatDate } from './utils/formatters';

✅ Kept (actually used):
import { formatPrice } from './utils/formatters';
```

### **2. Prefix Unused Variables with Underscore**
If you need to keep a variable for API compatibility but don't use it:

```javascript
// ESLint won't complain
const _unusedParam = value;

// Or destructure with underscore
const { used, _unused } = data;
```

### **3. Check Imported Functions Are Actually Used**
Always verify that functions imported from utils are called somewhere:

```javascript
// ✅ Good: Function is imported and used
import { calculateGroupQuote } from './utils/pricing';

function Component() {
  const result = calculateGroupQuote(...);
  return <div>{result}</div>;
}

// ❌ Bad: Function imported but never called
import { unusedFunction } from './utils/pricing';
```

---

## 📋 Common Unused Variables in This Project

### **In App.js (Fixed)**
Removed these unused imports:
- `INITIAL_FORM_STATE` - not directly used
- `INITIAL_TABLE_EDIT_VALUES` - not directly used
- `parseUnits` - used internally by pricing functions
- `formatCurrency` - not used
- `formatDate` - not used
- `generateId` - not used
- `deepCopy` - not used
- `getFabricPrice` - used internally
- `getMaxPriceForBlindType` - used internally
- `calculateGroupCost` - used internally
- `getBlindTypesFromFabrics` - not used

### **Why They Were Imported**
Some functions are used **internally** by other functions:
- `getFabricPrice()` is called inside `calculateGroupCost()`
- `calculateGroupCost()` is called inside `calculateGroupQuote()`
- These don't need to be imported at the App level

---

## 🤖 Automatic Cleanup on Every Build

The project is configured to **enforce** no-unused-vars:

1. **On save** (if using ESLint in IDE): Errors appear immediately
2. **On build** (via npm run build): Build fails if unused variables exist
3. **CI/CD** (Vercel/GitHub): Deployment fails without fix

---

## 🔍 ESLint Configuration

See `.eslintrc.json` for detailed settings:

```json
{
  "rules": {
    "no-unused-vars": [
      "error",
      {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_"
      }
    ]
  }
}
```

This means:
- ❌ **error** - Unused vars cause build to fail
- ✅ `^_` pattern - Variables starting with `_` are ignored

---

## 📝 Workflow for Adding New Features

### When Adding New Utility Function:

1. **Create function in utils file**
```javascript
// utils/pricing.js
export const newFunction = () => { ... };
```

2. **Import ONLY if used directly in App.js**
```javascript
import { newFunction } from './utils/pricing';
```

3. **Use it somewhere**
```javascript
const result = newFunction();
```

4. **If not using directly, don't import**
```javascript
// ❌ DON'T import if other functions use it internally
import { newFunction } from './utils/pricing';

// ✅ Only other util functions import it
// pricing.js internally: newFunction() called by calculateGroupQuote()
```

5. **Run linter**
```bash
npm run lint:fix
```

---

## 🎯 Remember

**The golden rule:** 
> Only import what you directly use in that file.
> 
> Functions used internally by other functions don't need to be imported at the top level.

---

## 📚 Resources

- [ESLint Documentation](https://eslint.org/docs/rules/no-unused-vars)
- [ESLint Playground](https://eslint.org/play)
- [Create React App ESLint](https://create-react-app.dev/docs/setting-up-your-editor/#displaying-lint-output-in-the-editor)

---

## ✅ Checklist Before Committing

- [ ] Run `npm run lint:fix`
- [ ] Run `npm run build` (should succeed)
- [ ] No unused variables errors
- [ ] All imports are used directly in the file
- [ ] Utility functions work correctly

---

**Questions?** Check `.eslintrc.json` or run `npm run lint` to see specific issues.
