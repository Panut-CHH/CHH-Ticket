/**
 * Test ERP API Connection
 * ทดสอบการเชื่อมต่อกับ ERP API
 */

import { checkErpConnection } from '@/utils/erpApi';

// ทดสอบการเชื่อมต่อ ERP
export async function testErpConnection() {
  console.log('🔍 Testing ERP Connection...');
  
  try {
    const result = await checkErpConnection();
    
    if (result.success) {
      console.log('✅ ERP Connection: SUCCESS');
      console.log('Status:', result.status);
      console.log('Message:', result.message);
    } else {
      console.log('❌ ERP Connection: FAILED');
      console.log('Error:', result.error);
    }
    
    return result;
  } catch (error) {
    console.log('❌ ERP Connection Test Error:', error.message);
    return { success: false, error: error.message };
  }
}

// ทดสอบการดึงข้อมูล Production Order
export async function testFetchProductionOrder(rpdNo = 'RPD2501-089') {
  console.log(`🔍 Testing Fetch Production Order: ${rpdNo}...`);
  
  try {
    // ใช้ internal API route แทนการเรียก ERP API โดยตรง
    const response = await fetch(`/api/erp/production-order/${rpdNo}`);
    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Fetch Production Order: SUCCESS');
      console.log('Data:', result.data);
    } else {
      console.log('❌ Fetch Production Order: FAILED');
      console.log('Error:', result.error);
    }
    
    return result;
  } catch (error) {
    console.log('❌ Fetch Production Order Test Error:', error.message);
    return { success: false, error: error.message };
  }
}

// ทดสอบการดึงข้อมูลหลาย Production Orders
export async function testFetchMultipleProductionOrders(rpdNumbers = ['RPD2501-089', 'RPD2501-090']) {
  console.log(`🔍 Testing Fetch Multiple Production Orders: ${rpdNumbers.join(', ')}...`);
  
  try {
    // ใช้ internal API route แทนการเรียก ERP API โดยตรง
    const response = await fetch('/api/erp/production-orders/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        rpdNumbers: rpdNumbers
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log('📊 Results Summary:');
      console.log(`Total: ${result.total}`);
      console.log(`Successful: ${result.successful}`);
      console.log(`Failed: ${result.failed}`);
      
      result.data.forEach((item) => {
        if (item.success) {
          console.log(`✅ ${item.rpdNo}: SUCCESS`);
        } else {
          console.log(`❌ ${item.rpdNo}: FAILED - ${item.error}`);
        }
      });
      
      return result.data;
    } else {
      console.log('❌ Batch Request Failed:', result.error);
      return [];
    }
  } catch (error) {
    console.log('❌ Fetch Multiple Production Orders Test Error:', error.message);
    return [];
  }
}

// ทดสอบทั้งหมด
export async function runAllTests() {
  console.log('🚀 Starting ERP API Tests...\n');
  
  // ทดสอบการเชื่อมต่อ
  await testErpConnection();
  console.log('');
  
  // ทดสอบการดึงข้อมูลเดียว
  await testFetchProductionOrder();
  console.log('');
  
  // ทดสอบการดึงข้อมูลหลายตัว
  await testFetchMultipleProductionOrders();
  console.log('');
  
  console.log('🏁 ERP API Tests Completed!');
}

// สำหรับใช้ใน browser console
if (typeof window !== 'undefined') {
  window.testErpApi = {
    testConnection: testErpConnection,
    testFetchSingle: testFetchProductionOrder,
    testFetchMultiple: testFetchMultipleProductionOrders,
    runAll: runAllTests
  };
  
  console.log('🧪 ERP API Test functions available:');
  console.log('- testErpApi.testConnection()');
  console.log('- testErpApi.testFetchSingle("RPD2501-089")');
  console.log('- testErpApi.testFetchMultiple(["RPD2501-089", "RPD2501-090"])');
  console.log('- testErpApi.runAll()');
}
