/**
 * ERP API Service
 * เชื่อมต่อกับ ERP API สำหรับดึงข้อมูล Production Order
 */

const ERP_BASE_URL = 'https://evergreen-bn.vercel.app/api/productionOrder';
const ERP_API_KEY = 'Bearer $2a$12$P5ikNWsRcf9o/8/zfuvQ2.u2ZrjmReGa.q8ljT37GmcgT9.Wb7Qtm';

/**
 * ดึงข้อมูล Production Order จาก ERP
 * @param {string} rpdNo - เลข RPD No.
 * @returns {Promise<Object>} ข้อมูล Production Order
 */
export async function fetchProductionOrder(rpdNo) {
  try {
    const response = await fetch(`${ERP_BASE_URL}/${rpdNo}`, {
      method: 'GET',
      headers: {
        'Authorization': ERP_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`ERP API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      success: true,
      data: data,
      error: null
    };
  } catch (error) {
    // ไม่แสดง error ใน console สำหรับ 404 (ไม่พบ RPD)
    if (!error.message.includes('404')) {
      console.error('Error fetching production order:', error);
    }
    return {
      success: false,
      data: null,
      error: error.message
    };
  }
}

/**
 * ตรวจสอบสถานะการเชื่อมต่อ ERP
 * @returns {Promise<Object>} สถานะการเชื่อมต่อ
 */
export async function checkErpConnection() {
  try {
    // ใช้ RPD No. ที่มีอยู่จริงเพื่อทดสอบการเชื่อมต่อ
    const testRpdNo = 'RPD2501-089';
    const response = await fetch(`${ERP_BASE_URL}/${testRpdNo}`, {
      method: 'GET',
      headers: {
        'Authorization': ERP_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    // ถ้าได้ response แสดงว่าเชื่อมต่อได้ (ไม่ว่าจะมีข้อมูลหรือไม่)
    return {
      success: true,
      status: response.status,
      error: null,
      message: response.ok 
        ? 'ERP connection successful' 
        : `ERP connected but returned ${response.status}`
    };
  } catch (error) {
    return {
      success: false,
      status: 0,
      error: error.message
    };
  }
}

/**
 * ดึงข้อมูลหลาย Production Orders พร้อมกัน
 * @param {string[]} rpdNumbers - Array ของเลข RPD No.
 * @returns {Promise<Object[]>} Array ของข้อมูล Production Orders
 */
export async function fetchMultipleProductionOrders(rpdNumbers) {
  try {
    const promises = rpdNumbers.map(rpdNo => fetchProductionOrder(rpdNo));
    const results = await Promise.allSettled(promises);
    
    return results.map((result, index) => ({
      rpdNo: rpdNumbers[index],
      success: result.status === 'fulfilled' && result.value.success,
      data: result.status === 'fulfilled' ? result.value.data : null,
      error: result.status === 'rejected' ? result.reason.message : 
             (result.status === 'fulfilled' ? result.value.error : null)
    }));
  } catch (error) {
    // ไม่แสดง error ใน console สำหรับ multiple requests
    return rpdNumbers.map(rpdNo => ({
      rpdNo,
      success: false,
      data: null,
      error: error.message
    }));
  }
}

/**
 * แปลงข้อมูล ERP เป็นรูปแบบที่ใช้ในระบบ
 * @param {Object} erpData - ข้อมูลจาก ERP
 * @param {string} rpdNo - เลข RPD No.
 * @returns {Object} ข้อมูลที่แปลงแล้ว
 */
export function transformErpData(erpData, rpdNo) {
  if (!erpData) {
    return {
      rpdNo,
      projectCode: rpdNo,
      syncStatus: 'failed',
      erpData: null,
      raw: null,
      lastSync: new Date().toISOString()
    };
  }

  // Some ERP endpoints return { success, data } while others return the record directly.
  const originalPayload = erpData;
  const record = typeof erpData === 'object' && erpData !== null && 'data' in erpData
    ? erpData.data
    : erpData;

  return {
    rpdNo,
    projectCode: record.projectCode || record.orderNumber || record.No || rpdNo,
    syncStatus: 'success',
    erpData: record,
    raw: originalPayload,
    lastSync: new Date().toISOString(),
    // เพิ่มฟิลด์อื่นๆ ตามที่ ERP ส่งมา
    customerName: record.customerName || record.Customer_Name || '',
    orderDate: record.orderDate || record.Starting_Date_Time || record.Order_Date || '',
    deliveryDate: record.deliveryDate || record.Delivery_Date || '',
    status: record.status || record.Status || '',
    quantity: record.quantity || record.Quantity || 0,
    unitPrice: record.unitPrice || record.Unit_Price || 0,
    totalAmount: record.totalAmount || record.Total_Amount || 0
  };
}

/**
 * Cache สำหรับเก็บข้อมูล ERP
 */
class ErpCache {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 นาที
  }

  set(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  get(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;

    // ตรวจสอบว่า cache หมดอายุหรือไม่
    if (Date.now() - cached.timestamp > this.cacheTimeout) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  clear() {
    this.cache.clear();
  }

  has(key) {
    const cached = this.cache.get(key);
    if (!cached) return false;

    if (Date.now() - cached.timestamp > this.cacheTimeout) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }
}

export const erpCache = new ErpCache();

/**
 * ดึงข้อมูลจาก ERP พร้อม Cache
 * @param {string} rpdNo - เลข RPD No.
 * @param {boolean} forceRefresh - บังคับให้ดึงข้อมูลใหม่
 * @returns {Promise<Object>} ข้อมูล Production Order
 */
export async function fetchProductionOrderWithCache(rpdNo, forceRefresh = false) {
  const cacheKey = `rpd_${rpdNo}`;
  
  if (!forceRefresh && erpCache.has(cacheKey)) {
    return {
      success: true,
      data: erpCache.get(cacheKey),
      error: null,
      fromCache: true
    };
  }

  const result = await fetchProductionOrder(rpdNo);
  
  if (result.success) {
    erpCache.set(cacheKey, result.data);
  }

  return {
    ...result,
    fromCache: false
  };
}
