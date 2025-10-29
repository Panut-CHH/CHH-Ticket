export const mockTickets = [
  {
    // ข้อมูลจาก API ตัวอย่าง
    id: "RPD2510-035",
    title: "4/3103 AD1.A3 บานประตูไม้อัดยาง Hollow Core กรุลามิเนต O2 รหัส 1611D ตีบังใบ 45 (ขอบบานล่าง)",
    priority: "High Priority",
    priorityClass: "bg-red-100 text-red-800",
    status: "Released", // จาก API
    statusClass: "text-green-600",
    assignee: "Admin User",
    time: "2 ชั่วโมงที่แล้ว",
    route: "000-DUMMY", // จาก API Routing_No
    routeClass: "bg-blue-100 text-blue-800",
    dueDate: "2025-10-11", // จาก API Due_Date
    quantity: 1, // จาก API Quantity
    rpd: "RPD2510-035", // จาก API No
    itemCode: "FG-00470-AD1.A-2-D", // จาก API Source_No
    projectCode: "PRJ-2025-001",
    description: "4/3103 AD1.A3 บานประตูไม้อัดยาง Hollow Core กรุลามิเนต O2 รหัส 1611D ตีบังใบ 45 (ขอบบานล่าง)", // จาก API Description
    description2: "ขนาด 3.5x100x235 CM.", // จาก API Description_2
    shortcutDimension1: "น้อย/สีรายวัน", // จาก API Shortcut_Dimension_1_Code
    shortcutDimension2: "00470", // จาก API Shortcut_Dimension_2_Code
    locationCode: "WH-FG", // จาก API Location_Code
    startingDateTime: "2025-09-26T09:25:00Z", // จาก API Starting_Date_Time
    endingDateTime: "2025-09-27T09:30:00Z", // จาก API Ending_Date_Time
    bwkRemainingConsumption: 1, // จาก API BWK_Remaining_Consumption
    searchDescription: "4/3103 AD1.A3 บานประตูไม้อัดยาง HOLLOW CORE กรุลามิเนต O2 รหัส 1611D ตีบังใบ 45 (ขอบบานล่าง)", // จาก API Search_Description
    erpCode: "ERP001",
    projectId: "PRJ001",
    customerName: "บริษัท เอบีซี จำกัด", // ชื่อลูกค้า
    bom: [
      { code: "MAT-001", name: "ไม้ MDF 18mm", qty: 4, unit: "แผ่น", issued: 2 },
      { code: "MAT-012", name: "บานพับบานตู้", qty: 6, unit: "ตัว", issued: 0 },
      { code: "MAT-034", name: "สกรู 1-1/2\"", qty: 50, unit: "ตัว", issued: 50 }
    ],
    stations: [
      { name: "ประกอบโครง", technician: "Admin User", priceType: "flat", price: 300 },
      { name: "ใสไม้ให้ได้ขนาด", technician: "ช่างสมชาย", priceType: "flat", price: 200 },
      { name: "QC", technician: "ช่างสมหญิง", priceType: "flat", price: 150 },
      { name: "อัดบาน", technician: "ช่างสมพร", priceType: "flat", price: 250 }
    ],
    roadmap: [
      { step: "ประกอบโครง", status: "pending" },
      { step: "ใสไม้ให้ได้ขนาด", status: "pending" },
      { step: "QC", status: "pending" },
      { step: "อัดบาน", status: "pending" }
    ]
  },
  {
    id: "RPD2510-036",
    title: "5/3104 BD2.B4 บานประตูไม้ยาง Solid Core กรุลามิเนต O3 รหัส 1612E ตีบังใบ 50 (ขอบบานบน)",
    priority: "Medium Priority",
    priorityClass: "bg-yellow-100 text-yellow-800",
    status: "Released",
    statusClass: "text-green-600",
    assignee: "สมหญิง รักดี",
    time: "5 ชั่วโมงที่แล้ว",
    route: "000-DUMMY",
    routeClass: "bg-green-100 text-green-800",
    dueDate: "2025-10-15",
    quantity: 2,
    rpd: "RPD2510-036",
    itemCode: "FG-00471-BD2.B-3-E",
    projectCode: "PRJ-2025-002",
    description: "5/3104 BD2.B4 บานประตูไม้ยาง Solid Core กรุลามิเนต O3 รหัส 1612E ตีบังใบ 50 (ขอบบานบน)",
    description2: "ขนาด 4.0x110x240 CM.",
    shortcutDimension1: "กลาง/สีรายสัปดาห์",
    shortcutDimension2: "00471",
    locationCode: "WH-FG",
    startingDateTime: "2025-09-27T10:00:00Z",
    endingDateTime: "2025-09-28T10:30:00Z",
    bwkRemainingConsumption: 2,
    searchDescription: "5/3104 BD2.B4 บานประตูไม้ยาง SOLID CORE กรุลามิเนต O3 รหัส 1612E ตีบังใบ 50 (ขอบบานบน)",
    erpCode: "ERP002",
    projectId: "PRJ002",
    customerName: "บริษัท ดีอีเอฟ จำกัด", // ชื่อลูกค้า
    roadmap: [
      { step: "CNC", status: "completed" },
      { step: "QC", status: "completed" }
    ]
  },
  {
    id: "RPD2510-037",
    title: "3/3102 CD3.C5 บานประตู MDF Hollow Core กรุลามิเนต O1 รหัส 1610C ตีบังใบ 40 (ขอบบานซ้าย)",
    priority: "Low Priority",
    priorityClass: "bg-gray-100 text-gray-800",
    status: "In Progress",
    statusClass: "text-amber-600",
    assignee: "สมศักดิ์ มั่นคง",
    time: "1 วันที่แล้ว",
    route: "001-PRODUCTION",
    routeClass: "bg-purple-100 text-purple-800",
    dueDate: "2025-10-20",
    quantity: 3,
    rpd: "RPD2510-037",
    itemCode: "FG-00472-CD3.C-1-C",
    projectCode: "PRJ-2025-001",
    description: "3/3102 CD3.C5 บานประตู MDF Hollow Core กรุลามิเนต O1 รหัส 1610C ตีบังใบ 40 (ขอบบานซ้าย)",
    description2: "ขนาด 2.5x90x220 CM.",
    shortcutDimension1: "มาก/สีรายเดือน",
    shortcutDimension2: "00472",
    locationCode: "WH-FG",
    startingDateTime: "2025-09-28T08:30:00Z",
    endingDateTime: "2025-09-29T09:00:00Z",
    bwkRemainingConsumption: 3,
    searchDescription: "3/3102 CD3.C5 บานประตู MDF HOLLOW CORE กรุลามิเนต O1 รหัส 1610C ตีบังใบ 40 (ขอบบานซ้าย)",
    erpCode: "ERP001",
    projectId: "PRJ001",
    customerName: "บริษัท เอบีซี จำกัด", // ชื่อลูกค้า
    roadmap: [
      { step: "สี", status: "completed" },
      { step: "QC", status: "pending" }
    ]
  },
  {
    id: "RPD2510-038",
    title: "6/3105 DD4.D6 บานประตูไม้อัดยาง Solid Core กรุลามิเนต O4 รหัส 1613F ตีบังใบ 55 (ขอบบานขวา)",
    priority: "High Priority",
    priorityClass: "bg-red-100 text-red-800",
    status: "Completed",
    statusClass: "text-green-600",
    assignee: "สมพร สุขใจ",
    time: "2 วันที่แล้ว",
    route: "002-QC",
    routeClass: "bg-orange-100 text-orange-800",
    dueDate: "2025-10-12",
    quantity: 4,
    rpd: "RPD2510-038",
    itemCode: "FG-00473-DD4.D-4-F",
    projectCode: "PRJ-2025-002",
    description: "6/3105 DD4.D6 บานประตูไม้อัดยาง Solid Core กรุลามิเนต O4 รหัส 1613F ตีบังใบ 55 (ขอบบานขวา)",
    description2: "ขนาด 4.5x120x250 CM.",
    shortcutDimension1: "น้อย/สีรายวัน",
    shortcutDimension2: "00473",
    locationCode: "WH-FG",
    startingDateTime: "2025-09-25T07:45:00Z",
    endingDateTime: "2025-09-26T08:15:00Z",
    bwkRemainingConsumption: 0,
    searchDescription: "6/3105 DD4.D6 บานประตูไม้อัดยาง SOLID CORE กรุลามิเนต O4 รหัส 1613F ตีบังใบ 55 (ขอบบานขวา)",
    erpCode: "ERP002",
    projectId: "PRJ002",
    roadmap: [
      { step: "Packing", status: "completed" },
      { step: "QC ก่อน pack", status: "completed" },
      { step: "FG", status: "completed" }
    ]
  },
  {
    id: "RPD2510-039",
    title: "7/3106 ED5.E7 บานประตูไม้สัก Hollow Core กรุลามิเนต O5 รหัส 1614G ตีบังใบ 60 (ขอบบานกลาง)",
    priority: "Medium Priority",
    priorityClass: "bg-yellow-100 text-yellow-800",
    status: "Pending",
    statusClass: "text-blue-600",
    assignee: "ยังไม่ได้มอบหมาย",
    time: "3 วันที่แล้ว",
    route: "000-DUMMY",
    routeClass: "bg-blue-100 text-blue-800",
    dueDate: "2025-10-25",
    quantity: 5,
    rpd: "RPD2510-039",
    itemCode: "FG-00474-ED5.E-5-G",
    projectCode: "PRJ-2025-003",
    description: "7/3106 ED5.E7 บานประตูไม้สัก Hollow Core กรุลามิเนต O5 รหัส 1614G ตีบังใบ 60 (ขอบบานกลาง)",
    description2: "ขนาด 5.0x130x260 CM.",
    shortcutDimension1: "กลาง/สีรายสัปดาห์",
    shortcutDimension2: "00474",
    locationCode: "WH-FG",
    startingDateTime: "2025-09-30T09:15:00Z",
    endingDateTime: "2025-10-01T10:00:00Z",
    bwkRemainingConsumption: 5,
    searchDescription: "7/3106 ED5.E7 บานประตูไม้สัก HOLLOW CORE กรุลามิเนต O5 รหัส 1614G ตีบังใบ 60 (ขอบบานกลาง)",
    erpCode: "ERP003",
    projectId: "PRJ003",
    roadmap: [
      { step: "รอมอบหมาย", status: "current" },
      { step: "ประกอบโครง", status: "pending" },
      { step: "ใสไม้ให้ได้ขนาด", status: "pending" },
      { step: "QC", status: "pending" },
      { step: "อัดบาน", status: "pending" }
    ]
  },
  {
    id: "RPD2510-040",
    title: "8/3107 FD6.F8 บานประตู MDF Solid Core กรุลามิเนต O6 รหัส 1615H ตีบังใบ 65 (ขอบบานล่าง)",
    priority: "High Priority",
    priorityClass: "bg-red-100 text-red-800",
    status: "Released",
    statusClass: "text-green-600",
    assignee: "Admin User",
    time: "4 ชั่วโมงที่แล้ว",
    route: "001-PRODUCTION",
    routeClass: "bg-green-100 text-green-800",
    dueDate: "2025-10-18",
    quantity: 6,
    rpd: "RPD2510-040",
    itemCode: "FG-00475-FD6.F-6-H",
    projectCode: "PRJ-2025-001",
    description: "8/3107 FD6.F8 บานประตู MDF Solid Core กรุลามิเนต O6 รหัส 1615H ตีบังใบ 65 (ขอบบานล่าง)",
    description2: "ขนาด 3.8x105x230 CM.",
    shortcutDimension1: "มาก/สีรายเดือน",
    shortcutDimension2: "00475",
    locationCode: "WH-FG",
    startingDateTime: "2025-09-29T11:30:00Z",
    endingDateTime: "2025-09-30T12:00:00Z",
    bwkRemainingConsumption: 6,
    searchDescription: "8/3107 FD6.F8 บานประตู MDF SOLID CORE กรุลามิเนต O6 รหัส 1615H ตีบังใบ 65 (ขอบบานล่าง)",
    erpCode: "ERP001",
    projectId: "PRJ001",
    bom: [
      { code: "MAT-210", name: "ไม้ยาง 25mm", qty: 3, unit: "แผ่น", issued: 1 },
      { code: "MAT-066", name: "แลคเกอร์ใส", qty: 1, unit: "แกลลอน", issued: 0 }
    ],
    stations: [
      { name: "CNC", technician: "ช่างสมชาย", priceType: "flat", price: 400 },
      { name: "QC", technician: "Admin User", priceType: "flat", price: 200 }
    ],
    roadmap: [
      { step: "CNC", status: "pending" },
      { step: "QC", status: "pending" }
    ]
  }
];




