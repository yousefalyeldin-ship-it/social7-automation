/**
 * Social 7 Bar & Grill - Automated Order Placement
 * PRODUCTION VERSION - Based on actual website flow
 * 
 * SETUP:
 * npm install puppeteer puppeteer-extra puppeteer-extra-plugin-stealth
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

// Configuration
const CONFIG = {
  restaurantURL: 'https://order.tbdine.com/pickup/48684/menu',
  botEmail: 'yousef.alyeldin5@gmial.com', 
  botLastName: 'PAM', // Identifier for bot orders
  headless: true, // Set to false for debugging
  timeout: 30000,
  screenshotOnError: true,
  defaultWaitTime: 2000
};

/**
 * Main function to place an order
 */
async function placeOrder(orderData) {
  const {
    order_items,        // "bruschetta, 1lb wings hot sauce"
    customer_name,      // "John Smith"
    customer_phone,     // "4165551234"
    pickup_time,        // "in 30 minutes" (actually ignored - site auto-calculates)
    special_instructions // "no onions, extra sauce"
  } = orderData;

  let browser;
  let orderResult = {
    success: false,
    confirmationNumber: null,
    estimatedPickupTime: null,
    totalAmount: null,
    error: null,
    screenshots: []
  };

  try {
    console.log('🚀 Starting Social 7 order automation...');
    console.log('Order details:', JSON.stringify(orderData, null, 2));

    // Launch browser
    browser = await puppeteer.launch({
      headless: CONFIG.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080'
      ]
    });

    const page = await browser.newPage();
    
    // Set realistic viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Step 1: Navigate to ordering page
    console.log('📍 Step 1: Loading menu...');
    await page.goto(CONFIG.restaurantURL, { 
      waitUntil: 'networkidle2',
      timeout: CONFIG.timeout 
    });
    await page.waitForTimeout(3000);
    await takeScreenshot(page, '01-homepage', orderResult);

    // Step 2: Add items to cart
    console.log('🍽️  Step 2: Adding items to cart...');
    await addItemsToCart(page, order_items, orderResult);
    await takeScreenshot(page, '02-cart-filled', orderResult);

    // Step 3: Click Checkout
    console.log('🛒 Step 3: Going to checkout...');
    await clickCheckout(page, orderResult);
    await takeScreenshot(page, '03-checkout-modal', orderResult);

    // Step 4: Continue as Guest
    console.log('👤 Step 4: Selecting guest checkout...');
    await continueAsGuest(page, orderResult);
    await takeScreenshot(page, '04-guest-form', orderResult);

    // Step 5: Fill guest information
    console.log('📝 Step 5: Filling customer information...');
    await fillGuestInfo(page, customer_name, customer_phone, orderResult);
    await takeScreenshot(page, '05-guest-info-filled', orderResult);

    // Step 6: Submit guest form
    console.log('✅ Step 6: Submitting guest form...');
    await submitGuestForm(page, orderResult);
    await takeScreenshot(page, '06-final-checkout', orderResult);

    // Step 7: Add pickup notes (special instructions)
    if (special_instructions && special_instructions.trim() !== '') {
      console.log('📝 Step 7: Adding special instructions...');
      await addPickupNotes(page, special_instructions, orderResult);
    }

    // Step 8: Verify payment method (should already be "Cash - Pay at restaurant")
    console.log('💳 Step 8: Verifying payment method...');
    await verifyPaymentMethod(page, orderResult);
    await takeScreenshot(page, '07-before-submit', orderResult);

    // Step 9: Place the order!
    console.log('🎉 Step 9: Placing order...');
    await placeOrderFinal(page, orderResult);
    await page.waitForTimeout(3000);
    await takeScreenshot(page, '08-confirmation', orderResult);

    // Step 10: Extract confirmation details
    console.log('📋 Step 10: Extracting confirmation...');
    await extractConfirmationDetails(page, orderResult);

    orderResult.success = true;
    console.log('✅ Order placed successfully!');
    console.log('Confirmation:', orderResult.confirmationNumber);
    console.log('Pickup time:', orderResult.estimatedPickupTime);
    console.log('Total:', orderResult.totalAmount);

  } catch (error) {
    console.error('❌ Order failed:', error.message);
    orderResult.error = error.message;
    orderResult.stack = error.stack;
    
    if (browser && CONFIG.screenshotOnError) {
      try {
        const pages = await browser.pages();
        const page = pages[pages.length - 1];
        if (page) {
          await takeScreenshot(page, '99-error-state', orderResult);
          // Get page HTML for debugging
          const html = await page.content();
          orderResult.errorPageHTML = html.substring(0, 5000); // First 5000 chars
        }
      } catch (screenshotError) {
        console.error('Could not take error screenshot:', screenshotError.message);
      }
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  return orderResult;
}

/**
 * Add items to cart
 */
async function addItemsToCart(page, orderItems, result) {
  const items = parseOrderItems(orderItems);
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    console.log(`  Adding item ${i + 1}/${items.length}: ${item.raw}`);
    
    try {
      // Search for and click the item
      await findAndClickItem(page, item);
      
      // Wait for modal to appear
      await page.waitForTimeout(2000);
      
      // Handle customization modal
      await handleItemModal(page, item);
      
      // Click "Add to Cart"
      await clickAddToCart(page);
      
      // Wait for modal to close
      await page.waitForTimeout(1500);
      
      console.log(`  ✓ Added ${item.name} to cart`);
      
    } catch (error) {
      throw new Error(`Failed to add ${item.name} to cart: ${error.message}`);
    }
  }
}

/**
 * Find and click a menu item
 */
async function findAndClickItem(page, item) {
  // Method 1: Try exact text match
  try {
    const itemButton = await page.evaluateHandle((itemName) => {
      const elements = Array.from(document.querySelectorAll('*'));
      const match = elements.find(el => {
        const text = el.textContent.trim().toLowerCase();
        return text === itemName.toLowerCase() && 
               (el.tagName === 'DIV' || el.tagName === 'BUTTON' || el.tagName === 'A');
      });
      return match;
    }, item.name);
    
    if (itemButton) {
      await itemButton.click();
      return;
    }
  } catch (e) {
    // Continue to next method
  }

  // Method 2: Try clicking by text content (partial match)
  try {
    await page.evaluate((itemName) => {
      const elements = Array.from(document.querySelectorAll('div, button, a'));
      const match = elements.find(el => 
        el.textContent.toLowerCase().includes(itemName.toLowerCase())
      );
      if (match) {
        match.click();
        return true;
      }
      throw new Error('Item not found');
    }, item.name);
    return;
  } catch (e) {
    // Continue to next method
  }

  // Method 3: Use XPath
  try {
    const xpath = `//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${item.name.toLowerCase()}')]`;
    const elements = await page.$x(xpath);
    if (elements.length > 0) {
      await elements[0].click();
      return;
    }
  } catch (e) {
    // Continue to error
  }

  throw new Error(`Could not find menu item: ${item.name}`);
}

/**
 * Handle item customization modal
 */
async function handleItemModal(page, item) {
  // Check if there are required selections (like Quesadilla)
  const hasRequiredSelection = await page.evaluate(() => {
    const text = document.body.textContent;
    return text.includes('CHOOSE A MINIMUM OF') || text.includes('REQUIRED');
  });

  if (hasRequiredSelection) {
    console.log(`    Item has required selections, selecting defaults...`);
    // Click the first available option (usually "Regular")
    try {
      const regularButton = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const regularBtn = buttons.find(btn => 
          btn.textContent.toLowerCase().includes('regular')
        );
        return regularBtn;
      });
      if (regularButton) {
        await regularButton.click();
        await page.waitForTimeout(500);
      }
    } catch (e) {
      console.log('    Warning: Could not select required option');
    }
  }

  // Handle modifications if specified
  if (item.modifications && item.modifications.length > 0) {
    console.log(`    Applying modifications: ${item.modifications.join(', ')}`);
    for (const mod of item.modifications) {
      try {
        await page.evaluate((modText) => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const modBtn = buttons.find(btn => 
            btn.textContent.toLowerCase().includes(modText.toLowerCase())
          );
          if (modBtn) modBtn.click();
        }, mod);
        await page.waitForTimeout(500);
      } catch (e) {
        console.log(`    Warning: Could not apply modification: ${mod}`);
      }
    }
  }

  // Handle quantity if more than 1
  if (item.quantity > 1) {
    console.log(`    Setting quantity to ${item.quantity}`);
    for (let i = 1; i < item.quantity; i++) {
      try {
        // Find the + button next to quantity
        await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const plusBtn = buttons.find(btn => 
            btn.textContent === '+' && 
            btn.parentElement?.textContent.match(/\d+/)
          );
          if (plusBtn) plusBtn.click();
        });
        await page.waitForTimeout(500);
      } catch (e) {
        console.log(`    Warning: Could not increase quantity`);
        break;
      }
    }
  }
}

/**
 * Click "Add to Cart" button
 */
async function clickAddToCart(page) {
  try {
    // Method 1: Find button with "Add to Cart" text
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const addBtn = buttons.find(btn => 
        btn.textContent.includes('Add to Cart')
      );
      if (addBtn) {
        addBtn.click();
        return;
      }
      throw new Error('Add to Cart button not found');
    });
  } catch (e) {
    // Method 2: Try finding by class or common patterns
    const addButtonSelectors = [
      'button[class*="add-to-cart"]',
      'button[class*="AddToCart"]',
      '.add-button',
      'button.teal',
      'button[type="submit"]'
    ];
    
    for (const selector of addButtonSelectors) {
      try {
        await page.click(selector);
        return;
      } catch (err) {
        continue;
      }
    }
    
    throw new Error('Could not find Add to Cart button');
  }
}

/**
 * Click checkout button
 */
async function clickCheckout(page, result) {
  await page.waitForTimeout(1000);
  
  try {
    // Find and click the Checkout button
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const checkoutBtn = buttons.find(btn => 
        btn.textContent.trim() === 'Checkout'
      );
      if (checkoutBtn) {
        checkoutBtn.click();
        return;
      }
      throw new Error('Checkout button not found');
    });
    
    await page.waitForTimeout(2000);
  } catch (error) {
    throw new Error(`Failed to click checkout: ${error.message}`);
  }
}

/**
 * Continue as guest
 */
async function continueAsGuest(page, result) {
  await page.waitForTimeout(1000);
  
  try {
    // Click "Continue as Guest" button
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const guestBtn = buttons.find(btn => 
        btn.textContent.includes('Continue as Guest')
      );
      if (guestBtn) {
        guestBtn.click();
        return;
      }
      throw new Error('Continue as Guest button not found');
    });
    
    await page.waitForTimeout(2000);
  } catch (error) {
    throw new Error(`Failed to continue as guest: ${error.message}`);
  }
}

/**
 * Fill guest information form
 */
async function fillGuestInfo(page, customerName, customerPhone, result) {
  // Parse name (take first word as first name)
  const firstName = customerName.split(' ')[0];
  const lastName = CONFIG.botLastName; // "PAM"
  
  // Format phone number (remove any formatting)
  const cleanPhone = customerPhone.replace(/\D/g, '');
  
  try {
    // Fill First Name
    const firstNameInput = await page.$('input[placeholder*="first name" i]');
    if (!firstNameInput) throw new Error('First name field not found');
    await firstNameInput.click();
    await firstNameInput.type(firstName, { delay: 50 });
    
    // Fill Last Name
    const lastNameInput = await page.$('input[placeholder*="last name" i]');
    if (!lastNameInput) throw new Error('Last name field not found');
    await lastNameInput.click();
    await lastNameInput.type(lastName, { delay: 50 });
    
    // Fill Email
    const emailInput = await page.$('input[placeholder*="email" i]');
    if (!emailInput) throw new Error('Email field not found');
    await emailInput.click();
    await emailInput.type(CONFIG.botEmail, { delay: 50 });
    
    // Fill Phone
    const phoneInput = await page.$('input[placeholder*="phone" i]');
    if (!phoneInput) throw new Error('Phone field not found');
    await phoneInput.click();
    await phoneInput.type(cleanPhone, { delay: 50 });
    
    console.log(`  ✓ Filled guest info: ${firstName} ${lastName}, ${cleanPhone}`);
    
  } catch (error) {
    throw new Error(`Failed to fill guest info: ${error.message}`);
  }
}

/**
 * Submit guest form
 */
async function submitGuestForm(page, result) {
  await page.waitForTimeout(1000);
  
  try {
    // Click the "Continue as Guest" submit button
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const submitBtn = buttons.find(btn => 
        btn.textContent.includes('Continue as Guest') &&
        !btn.disabled
      );
      if (submitBtn) {
        submitBtn.click();
        return;
      }
      throw new Error('Submit button not found or disabled');
    });
    
    // Wait for checkout page to load
    await page.waitForTimeout(3000);
    
    // Verify we're on checkout page
    await page.waitForFunction(() => {
      return document.body.textContent.includes('Checkout') ||
             document.body.textContent.includes('Payment Details');
    }, { timeout: 10000 });
    
  } catch (error) {
    throw new Error(`Failed to submit guest form: ${error.message}`);
  }
}

/**
 * Add pickup notes (special instructions)
 */
async function addPickupNotes(page, instructions, result) {
  try {
    // Find the pickup notes textarea
    const notesField = await page.$('textarea, input[placeholder*="Pickup Notes" i], input[placeholder*="notes" i]');
    
    if (notesField) {
      await notesField.click();
      await notesField.type(instructions, { delay: 50 });
      console.log(`  ✓ Added pickup notes: ${instructions}`);
    } else {
      console.log('  ⚠️  Pickup notes field not found (this is OK)');
    }
  } catch (error) {
    console.log('  ⚠️  Could not add pickup notes:', error.message);
  }
}

/**
 * Verify payment method is "Cash - Pay at restaurant"
 */
async function verifyPaymentMethod(page, result) {
  try {
    const cashSelected = await page.evaluate(() => {
      // Check if "Cash - Pay at restaurant" radio is selected
      const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
      const cashRadio = radios.find(radio => {
        const label = radio.parentElement?.textContent || '';
        return label.toLowerCase().includes('cash') && 
               label.toLowerCase().includes('restaurant');
      });
      return cashRadio?.checked || false;
    });
    
    if (!cashSelected) {
      console.log('  ⚠️  Cash payment not selected, attempting to select...');
      // Try to click it
      await page.evaluate(() => {
        const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
        const cashRadio = radios.find(radio => {
          const label = radio.parentElement?.textContent || '';
          return label.toLowerCase().includes('cash') && 
                 label.toLowerCase().includes('restaurant');
        });
        if (cashRadio) {
          cashRadio.click();
        }
      });
      await page.waitForTimeout(500);
    } else {
      console.log('  ✓ Payment method: Cash - Pay at restaurant');
    }
  } catch (error) {
    console.log('  ⚠️  Could not verify payment method:', error.message);
  }
}

/**
 * Place the final order
 */
async function placeOrderFinal(page, result) {
  try {
    // Click "Place Order" button
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const placeOrderBtn = buttons.find(btn => 
        btn.textContent.includes('Place Order')
      );
      if (placeOrderBtn) {
        placeOrderBtn.click();
        return;
      }
      throw new Error('Place Order button not found');
    });
    
    // Wait for confirmation page
    await page.waitForFunction(() => {
      return document.body.textContent.includes('Order Placed') ||
             document.body.textContent.includes('Order Confirmed');
    }, { timeout: 15000 });
    
  } catch (error) {
    throw new Error(`Failed to place order: ${error.message}`);
  }
}

/**
 * Extract confirmation details from confirmation page
 */
async function extractConfirmationDetails(page, result) {
  try {
    const pageText = await page.evaluate(() => document.body.textContent);
    
    // Extract order number
    const orderNumberPatterns = [
      /Order Number:\s*([A-Za-z0-9\-]+)/i,
      /Order\s*#?\s*:?\s*([A-Za-z0-9\-]+)/i,
      /#([A-Za-z0-9]{5,})/,
      /\b([A-Z][a-z]+)\b/ // Pattern like "Twelfth", "Third", etc.
    ];
    
    for (const pattern of orderNumberPatterns) {
      const match = pageText.match(pattern);
      if (match) {
        result.confirmationNumber = match[1];
        break;
      }
    }
    
    if (!result.confirmationNumber) {
      result.confirmationNumber = 'ORDER_PLACED_NO_NUMBER';
    }
    
    // Extract pickup time
    const pickupPatterns = [
      /(\d+[-\s]?\d*\s*minutes?)/i,
      /Approximately\s+(\d+[-\s]?\d*\s*minutes?)/i,
      /(\d+:\d+\s*[AP]M)/i
    ];
    
    for (const pattern of pickupPatterns) {
      const match = pageText.match(pattern);
      if (match) {
        result.estimatedPickupTime = match[1];
        break;
      }
    }
    
    if (!result.estimatedPickupTime) {
      result.estimatedPickupTime = '30-40 minutes';
    }
    
    // Extract total amount
    const totalPatterns = [
      /Total[:\s]+\$?([\d,]+\.?\d*)/i,
      /\$(\d+\.\d{2})\s*$/m
    ];
    
    for (const pattern of totalPatterns) {
      const match = pageText.match(pattern);
      if (match) {
        result.totalAmount = `$${match[1]}`;
        break;
      }
    }
    
    console.log(`  ✓ Order Number: ${result.confirmationNumber}`);
    console.log(`  ✓ Pickup Time: ${result.estimatedPickupTime}`);
    console.log(`  ✓ Total: ${result.totalAmount || 'Not extracted'}`);
    
  } catch (error) {
    console.log('  ⚠️  Could not extract all confirmation details:', error.message);
  }
}

/**
 * Take screenshot for debugging
 */
async function takeScreenshot(page, name, result) {
  if (!CONFIG.screenshotOnError) return;
  
  try {
    const screenshot = await page.screenshot({ 
      encoding: 'base64',
      fullPage: true 
    });
    result.screenshots.push({
      name,
      data: screenshot,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.log(`  ⚠️  Could not take screenshot ${name}:`, error.message);
  }
}

/**
 * Parse order items string into structured data
 */
function parseOrderItems(orderItemsString) {
  const items = orderItemsString.split(',').map(item => item.trim());
  
  return items.map(item => {
    const parsed = {
      raw: item,
      name: '',
      quantity: 1,
      modifications: []
    };
    
    // Extract quantity if specified (e.g., "2 burgers")
    const qtyMatch = item.match(/^(\d+)\s+(.+)/);
    if (qtyMatch) {
      parsed.quantity = parseInt(qtyMatch[1]);
      item = qtyMatch[2];
    }
    
    // Extract main item name (before any "with" or modifications)
    const withIndex = item.toLowerCase().indexOf(' with ');
    if (withIndex > -1) {
      parsed.name = item.substring(0, withIndex).trim();
      const modsText = item.substring(withIndex + 6).trim();
      parsed.modifications = modsText.split(/\s+and\s+|\s*,\s*/).map(m => m.trim());
    } else {
      parsed.name = item.trim();
    }
    
    // Normalize common item names
    const nameLower = parsed.name.toLowerCase();
    if (nameLower.includes('bruschetta')) parsed.name = 'Bruschetta';
    else if (nameLower.includes('wing')) parsed.name = nameLower.includes('1lb') || nameLower.includes('one lb') ? '1lb Wings' : '2lb Wings';
    else if (nameLower.includes('quesadilla')) parsed.name = 'Quesadilla';
    else if (nameLower.includes('burger')) parsed.name = 'Angus Burger';
    else if (nameLower.includes('caesar')) parsed.name = 'Caesar Salad';
    else if (nameLower.includes('garlic bread')) parsed.name = 'Garlic Bread W/cheese';
    
    return parsed;
  });
}

// Export for use in other modules or n8n
module.exports = { placeOrder };

// Example usage (for testing)
if (require.main === module) {
  const testOrder = {
    order_items: 'bruschetta',
    customer_name: 'John Smith',
    customer_phone: '4165551234',
    pickup_time: 'ASAP',
    special_instructions: 'Extra napkins please'
  };
  
  placeOrder(testOrder)
    .then(result => {
      console.log('\n=== FINAL RESULT ===');
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}