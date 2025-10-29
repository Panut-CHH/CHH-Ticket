"use client";

import React, { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/utils/translations";
import { 
  Play, 
  CheckCircle, 
  XCircle, 
  Loader, 
  Activity,
  RefreshCw,
  Database,
  AlertTriangle
} from "lucide-react";

export default function ErpTestComponent() {
  const { language } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [testResults, setTestResults] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState(null);

  // ทดสอบการเชื่อมต่อ ERP
  const testErpConnection = async () => {
    setIsLoading(true);
    setTestResults([]);
    
    try {
      const response = await fetch('/api/erp/status');
      const result = await response.json();
      
      setConnectionStatus(result);
      
      setTestResults(prev => [...prev, {
        id: Date.now(),
        test: language === 'th' ? 'ทดสอบการเชื่อมต่อ ERP' : 'Test ERP Connection',
        success: result.success,
        message: result.success 
          ? (result.message || (language === 'th' ? 'เชื่อมต่อสำเร็จ' : 'Connection successful'))
          : result.error,
        timestamp: new Date().toISOString(),
        status: result.status
      }]);
    } catch (error) {
      setTestResults(prev => [...prev, {
        id: Date.now(),
        test: language === 'th' ? 'ทดสอบการเชื่อมต่อ ERP' : 'Test ERP Connection',
        success: false,
        message: error.message,
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // ทดสอบการดึงข้อมูล Production Order
  const testFetchProductionOrder = async (rpdNo = 'RPD2501-089') => {
    setIsLoading(true);
    
    try {
      const response = await fetch(`/api/erp/production-order/${rpdNo}`);
      const result = await response.json();
      
      setTestResults(prev => [...prev, {
        id: Date.now(),
        test: `${language === 'th' ? 'ทดสอบดึงข้อมูล' : 'Test Fetch Data'}: ${rpdNo}`,
        success: result.success,
        message: result.success 
          ? (language === 'th' ? 'ดึงข้อมูลสำเร็จ' : 'Data fetched successfully')
          : result.error,
        timestamp: new Date().toISOString(),
        data: result.data
      }]);
    } catch (error) {
      setTestResults(prev => [...prev, {
        id: Date.now(),
        test: `${language === 'th' ? 'ทดสอบดึงข้อมูล' : 'Test Fetch Data'}: ${rpdNo}`,
        success: false,
        message: error.message,
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // ทดสอบการดึงข้อมูลหลาย Production Orders
  const testFetchMultipleOrders = async () => {
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/erp/production-orders/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rpdNumbers: ['RPD2501-089', 'RPD2501-090', 'RPD2501-091']
        })
      });
      
      const result = await response.json();
      
      setTestResults(prev => [...prev, {
        id: Date.now(),
        test: language === 'th' ? 'ทดสอบดึงข้อมูลหลายตัว' : 'Test Fetch Multiple Orders',
        success: result.success,
        message: result.success 
          ? `${language === 'th' ? 'ดึงข้อมูลสำเร็จ' : 'Data fetched successfully'}: ${result.successful}/${result.total}`
          : result.error,
        timestamp: new Date().toISOString(),
        data: result.data
      }]);
    } catch (error) {
      setTestResults(prev => [...prev, {
        id: Date.now(),
        test: language === 'th' ? 'ทดสอบดึงข้อมูลหลายตัว' : 'Test Fetch Multiple Orders',
        success: false,
        message: error.message,
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // รันการทดสอบทั้งหมด
  const runAllTests = async () => {
    setIsLoading(true);
    setTestResults([]);
    
    await testErpConnection();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await testFetchProductionOrder();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await testFetchMultipleOrders();
    
    setIsLoading(false);
  };

  // ล้างผลการทดสอบ
  const clearResults = () => {
    setTestResults([]);
    setConnectionStatus(null);
  };

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      {connectionStatus && (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
          <div className={`p-4 rounded-lg border ${
            connectionStatus.success 
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' 
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          }`}>
            <div className="flex items-center gap-2">
              {connectionStatus.success ? (
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
              ) : (
                <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
              )}
              <span className={`font-medium ${
                connectionStatus.success 
                  ? 'text-green-800 dark:text-green-200' 
                  : 'text-red-800 dark:text-red-200'
              }`}>
                {connectionStatus.success 
                  ? (language === 'th' ? 'เชื่อมต่อ ERP สำเร็จ' : 'ERP Connected Successfully')
                  : (language === 'th' ? 'ไม่สามารถเชื่อมต่อ ERP ได้' : 'ERP Connection Failed')
                }
              </span>
              <span className="ml-auto text-sm text-gray-500 dark:text-gray-400">
                Status: {connectionStatus.status}
              </span>
            </div>
            {connectionStatus.error && (
              <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                {connectionStatus.error}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Test Controls */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          {language === 'th' ? 'การทดสอบ ERP' : 'ERP Test Controls'}
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            onClick={testErpConnection}
            disabled={isLoading}
            className="pressable px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              <Activity className="w-4 h-4" />
            )}
            {language === 'th' ? 'ทดสอบการเชื่อมต่อ' : 'Test Connection'}
          </button>

          <button
            onClick={() => testFetchProductionOrder()}
            disabled={isLoading}
            className="pressable px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              <Database className="w-4 h-4" />
            )}
            {language === 'th' ? 'ทดสอบดึงข้อมูล' : 'Test Fetch Data'}
          </button>

          <button
            onClick={testFetchMultipleOrders}
            disabled={isLoading}
            className="pressable px-4 py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {language === 'th' ? 'ทดสอบหลายตัว' : 'Test Multiple'}
          </button>

          <button
            onClick={runAllTests}
            disabled={isLoading}
            className="pressable px-4 py-3 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {language === 'th' ? 'ทดสอบทั้งหมด' : 'Run All Tests'}
          </button>
        </div>

        <div className="mt-4 flex justify-between items-center">
          <button
            onClick={clearResults}
            className="px-3 py-1 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
          >
            {language === 'th' ? 'ล้างผลลัพธ์' : 'Clear Results'}
          </button>
          
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {language === 'th' ? 'จำนวนการทดสอบ:' : 'Tests run:'} {testResults.length}
          </div>
        </div>
      </div>

      {/* Test Results */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {language === 'th' ? 'ผลการทดสอบ' : 'Test Results'}
          </h3>
        </div>
        
        <div className="divide-y divide-slate-200 dark:divide-slate-700">
          {testResults.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{language === 'th' ? 'ยังไม่มีการทดสอบ' : 'No tests run yet'}</p>
              <p className="text-sm mt-1">
                {language === 'th' ? 'คลิกปุ่มด้านบนเพื่อเริ่มทดสอบ' : 'Click buttons above to start testing'}
              </p>
            </div>
          ) : (
            testResults.map((result) => (
              <div key={result.id} className="p-6">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    {result.success ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-gray-900 dark:text-gray-100">
                        {result.test}
                      </h4>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        result.success 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                      }`}>
                        {result.success 
                          ? (language === 'th' ? 'สำเร็จ' : 'Success')
                          : (language === 'th' ? 'ล้มเหลว' : 'Failed')
                        }
                      </span>
                    </div>
                    
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                      {result.message}
                    </p>
                    
                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-500">
                      <span>{new Date(result.timestamp).toLocaleString()}</span>
                      {result.status && (
                        <span className="px-2 py-1 bg-gray-100 dark:bg-slate-700 rounded text-xs">
                          HTTP {result.status}
                        </span>
                      )}
                    </div>
                    
                    {result.data && (
                      <details className="mt-3">
                        <summary className="text-sm text-blue-600 dark:text-blue-400 cursor-pointer hover:text-blue-800 dark:hover:text-blue-300">
                          {language === 'th' ? 'ดูข้อมูล' : 'View Data'}
                        </summary>
                        <pre className="mt-2 p-3 bg-gray-50 dark:bg-slate-700 rounded text-xs overflow-auto max-h-40">
                          {JSON.stringify(result.data, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
