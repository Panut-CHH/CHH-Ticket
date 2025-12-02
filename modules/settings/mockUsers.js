// Mock data สำหรับระบบจัดการผู้ใช้
export const mockUsers = [
  {
    id: 1,
    name: "สมชาย ใจดี",
    email: "somchai@factory.com",
    role: "SuperAdmin",
    status: "active",
    avatar: "/pictureUser/pictureUser_1.png",
    createdAt: "2024-01-15",
    lastLogin: "2024-09-30"
  },
  {
    id: 2,
    name: "สมหญิง รักงาน",
    email: "somying@factory.com",
    role: "Admin",
    status: "active",
    avatar: null,
    createdAt: "2024-02-20",
    lastLogin: "2024-09-29"
  },
  {
    id: 3,
    name: "วิชัย ช่างฝีมือ",
    email: "wichai@factory.com",
    role: "Production",
    status: "active",
    avatar: null,
    createdAt: "2024-03-10",
    lastLogin: "2024-09-30"
  },
  {
    id: 4,
    name: "มานี ตรวจสอบ",
    email: "manee@factory.com",
    role: "QC",
    status: "active",
    avatar: null,
    createdAt: "2024-03-15",
    lastLogin: "2024-09-28"
  },
  {
    id: 5,
    name: "สมศักดิ์ ช่วยเหลือ",
    email: "somsak@factory.com",
    role: "Production",
    status: "active",
    avatar: null,
    createdAt: "2024-04-01",
    lastLogin: "2024-09-30"
  },
  {
    id: 6,
    name: "ชนาธิป ควบคุมเครื่อง",
    email: "chanathip@factory.com",
    role: "CNC",
    status: "active",
    avatar: null,
    createdAt: "2024-04-18",
    lastLogin: "2024-09-29"
  },
  {
    id: 7,
    name: "วิภา ผู้จัดการ",
    email: "wipa@factory.com",
    role: "Admin",
    status: "inactive",
    avatar: null,
    createdAt: "2024-01-05",
    lastLogin: "2024-08-15"
  },
  {
    id: 8,
    name: "ประเสริฐ คุณภาพ",
    email: "prasert@factory.com",
    role: "QC",
    status: "active",
    avatar: null,
    createdAt: "2024-05-12",
    lastLogin: "2024-09-29"
  },
  {
    id: 9,
    name: "สุดา ช่างเทคนิค",
    email: "suda@factory.com",
    role: "Production",
    status: "active",
    avatar: null,
    createdAt: "2024-06-20",
    lastLogin: "2024-09-30"
  },
  {
    id: 10,
    name: "จิราพร เขียนแบบ",
    email: "jiraporn@factory.com",
    role: "Drawing",
    status: "active",
    avatar: null,
    createdAt: "2024-07-15",
    lastLogin: "2024-09-30"
  },
  {
    id: 11,
    name: "วิศาล ออกแบบ",
    email: "wisarn@factory.com",
    role: "Drawing",
    status: "active",
    avatar: null,
    createdAt: "2024-08-01",
    lastLogin: "2024-09-29"
  }
];

export const roles = ["SuperAdmin", "Admin", "QC", "Production", "Painting", "Packing", "CNC", "Drawing"];

export const roleColors = {
  SuperAdmin: "bg-purple-100 text-purple-700 border-purple-200",
  Admin: "bg-blue-100 text-blue-700 border-blue-200",
  QC: "bg-amber-100 text-amber-700 border-amber-200",
  Production: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Painting: "bg-pink-100 text-pink-700 border-pink-200",
  Packing: "bg-indigo-100 text-indigo-700 border-indigo-200",
  CNC: "bg-cyan-100 text-cyan-700 border-cyan-200",
  Drawing: "bg-orange-100 text-orange-700 border-orange-200"
};

export const statusColors = {
  active: "bg-green-100 text-green-700 border-green-200",
  inactive: "bg-gray-100 text-gray-700 border-gray-200"
};

