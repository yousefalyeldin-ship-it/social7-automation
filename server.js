const express = require('express');
const { placeOrder } = require('./order-automation');

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3000;

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'Social 7 Order Automation'
  });
});

// Main order endpoint
app.post('/place-order', async (req, res) => {
  try {
    console.log('📥 Received order request:', JSON.stringify(req.body, null, 2));
    
    const orderData = {
      order_items: req.body.order_items,
      customer_name: req.body.customer_name,
      customer_phone: req.body.customer_phone,
      pickup_time: req.body.pickup_time || 'ASAP',
      special_instructions: req.body.special_instructions || ''
    };
    
    // Validate required fields
    if (!orderData.order_items || !orderData.customer_name || !orderData.customer_phone) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: order_items, customer_name, customer_phone'
      });
    }
    
    // Place the order
    console.log('🤖 Starting automation...');
    const result = await placeOrder(orderData);
    
    console.log('📤 Sending response:', JSON.stringify(result, null, 2));
    
    // Return result
    res.json(result);
    
  } catch (error) {
    console.error('❌ Error processing order:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Social 7 Order Automation server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Order endpoint: http://localhost:${PORT}/place-order`);
});