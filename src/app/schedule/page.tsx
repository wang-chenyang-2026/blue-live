'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';

// 数据类型定义
interface PersonSchedule {
  person: string;
  timeSlots: string[];
  totalHours: number;
  earlyMorningHours: number;
}

interface AccountSchedule {
  name: string;
  schedules: PersonSchedule[];
}

interface ApiResponse {
  date: string;
  brand: string;
  role: string;
  accounts: AccountSchedule[];
}

// 品牌配置
const BRANDS = [
  { id: 'vivo', label: 'vivo' },
  { id: 'iqoo', label: 'iQOO' },
] as const;

type BrandId = typeof BRANDS[number]['id'];

// 角色配置
const ROLES = [
  { id: 'anchor', label: '主播' },
  { id: 'control', label: '中控' },
] as const;

type RoleId = typeof ROLES[number]['id'];

// 品牌日期范围
const BRAND_DATE_RANGE: Record<BrandId, { min: string; max: string }> = {
  vivo: { min: '2026-06-01', max: '2026-07-07' },
  iqoo: { min: '2026-05-01', max: '2026-06-07' },
};

// 账号颜色映射
const ACCOUNT_COLORS: Record<string, string> = {
  'vivo（大号）': '#00a1d6',
  'vivo官方旗舰店（抖音）': '#ff6b35',
  'vivo官方旗舰店（快手）': '#00c9a7',
  'iQOO手机': '#4facfe',
  'iQOO官方旗舰店（抖音）': '#00c9a7',
  'iQOO官方旗舰店（快手）': '#ffb84d',
};

function getAccountColor(name: string): string {
  return ACCOUNT_COLORS[name] || '#667eea';
}

// 账号Tab组件
const AccountTabs: React.FC<{
  accounts: AccountSchedule[];
  activeAccount: string;
  onAccountChange: (account: string) => void;
}> = ({ accounts, activeAccount, onAccountChange }) => {
  const tabs = [
    { id: 'all', label: '全部账号' },
    ...accounts.map(acc => ({ id: acc.name, label: acc.name })),
  ];

  return (
    <div style={{
      display: 'flex',
      gap: '12px',
      marginBottom: '24px',
      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
      paddingBottom: '12px',
      flexWrap: 'wrap',
    }}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onAccountChange(tab.id)}
          style={{
            padding: '10px 20px',
            borderRadius: '8px',
            border: 'none',
            background: activeAccount === tab.id
              ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
              : 'rgba(255, 255, 255, 0.05)',
            color: activeAccount === tab.id ? '#fff' : 'rgba(255, 255, 255, 0.6)',
            fontSize: '14px',
            fontWeight: activeAccount === tab.id ? '600' : '400',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            boxShadow: activeAccount === tab.id
              ? '0 4px 15px rgba(102, 126, 234, 0.4)'
              : 'none',
          }}
        >
          {tab.label}
          {tab.id !== 'all' && (
            <span style={{
              marginLeft: '8px',
              padding: '2px 8px',
              borderRadius: '10px',
              background: activeAccount === tab.id
                ? 'rgba(255, 255, 255, 0.2)'
                : 'rgba(102, 126, 234, 0.3)',
              fontSize: '12px',
            }}>
              {accounts.find(a => a.name === tab.id)?.schedules.length || 0}
            </span>
          )}
        </button>
      ))}
    </div>
  );
};

// 人员排班卡片
const PersonCard: React.FC<{
  schedule: PersonSchedule;
  accountColor: string;
}> = ({ schedule, accountColor }) => {
  const getHoursColor = (hours: number) => {
    if (hours >= 8) return '#66df7c';
    if (hours >= 4) return '#4facfe';
    if (hours >= 2) return '#ffb84d';
    return '#ff6b6b';
  };

  return (
    <div style={{
      background: 'rgba(255, 255, 255, 0.03)',
      borderRadius: '16px',
      padding: '20px',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      transition: 'all 0.3s ease',
    }}
    onMouseOver={(e) => {
      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
      e.currentTarget.style.borderColor = accountColor;
      e.currentTarget.style.transform = 'translateY(-2px)';
    }}
    onMouseOut={(e) => {
      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
      e.currentTarget.style.transform = 'translateY(0)';
    }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
        paddingBottom: '12px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${accountColor} 0%, ${accountColor}66 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            fontWeight: '700',
            color: '#fff',
          }}>
            {schedule.person.slice(0, 1)}
          </div>
          <div>
            <h3 style={{
              color: '#fff',
              fontSize: '16px',
              fontWeight: '600',
              margin: '0 0 2px 0',
            }}>
              {schedule.person}
            </h3>
            <span style={{
              color: 'rgba(255, 255, 255, 0.5)',
              fontSize: '12px',
            }}>
              {schedule.timeSlots.length} 个时间段
            </span>
          </div>
        </div>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '4px',
        }}>
          <span style={{
            background: `${getHoursColor(schedule.totalHours)}22`,
            color: getHoursColor(schedule.totalHours),
            padding: '6px 12px',
            borderRadius: '20px',
            fontSize: '14px',
            fontWeight: '600',
          }}>
            {schedule.totalHours} 小时
          </span>
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <div style={{
          color: 'rgba(255, 255, 255, 0.6)',
          fontSize: '12px',
          marginBottom: '8px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}>
          直播时间段
        </div>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px',
        }}>
          {schedule.timeSlots.map((slot, index) => {
            const isEarlyMorning = /(^|[^\d])([2-7])[-–]/.test(slot);
            return (
              <span
                key={index}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  background: isEarlyMorning
                    ? 'rgba(255, 183, 77, 0.15)'
                    : 'rgba(102, 126, 234, 0.15)',
                  color: isEarlyMorning ? '#ffb84d' : '#667eea',
                  fontSize: '12px',
                  fontWeight: '500',
                }}
              >
                {slot}
              </span>
            );
          })}
        </div>
      </div>

      {schedule.earlyMorningHours > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px',
          background: 'rgba(255, 183, 77, 0.1)',
          borderRadius: '8px',
          border: '1px solid rgba(255, 183, 77, 0.2)',
        }}>
          <span style={{ fontSize: '16px' }}>🌅</span>
          <span style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '13px' }}>
            凌晨班（2-8点）
          </span>
          <span style={{
            marginLeft: 'auto',
            color: '#ffb84d',
            fontSize: '14px',
            fontWeight: '600',
          }}>
            {schedule.earlyMorningHours} 小时
          </span>
        </div>
      )}
    </div>
  );
};

// 账号分组
const AccountGroup: React.FC<{
  account: AccountSchedule;
  color: string;
}> = ({ account, color }) => {
  return (
    <div style={{ marginBottom: '32px' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '16px',
      }}>
        <div style={{
          width: '8px',
          height: '32px',
          borderRadius: '4px',
          background: `linear-gradient(180deg, ${color} 0%, ${color}66 100%)`,
        }} />
        <h2 style={{
          color: '#fff',
          fontSize: '20px',
          fontWeight: '600',
          margin: 0,
        }}>
          {account.name}
        </h2>
        <span style={{
          marginLeft: '12px',
          padding: '4px 12px',
          borderRadius: '20px',
          background: `${color}22`,
          color: color,
          fontSize: '13px',
          fontWeight: '500',
        }}>
          {account.schedules.length} 人
        </span>
      </div>

      {account.schedules.length === 0 ? (
        <div style={{
          padding: '40px',
          background: 'rgba(255, 255, 255, 0.02)',
          borderRadius: '16px',
          border: '1px dashed rgba(255, 255, 255, 0.1)',
          textAlign: 'center',
        }}>
          <span style={{ fontSize: '48px', opacity: 0.5 }}>📭</span>
          <p style={{ color: 'rgba(255, 255, 255, 0.5)', marginTop: '12px' }}>
            暂无排班数据
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
          gap: '16px',
        }}>
          {account.schedules.map((schedule, index) => (
            <div
              key={`${schedule.person}-${index}`}
              style={{ animation: 'fadeIn 0.3s ease' }}
            >
              <PersonCard schedule={schedule} accountColor={color} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// 加载状态
const LoadingSpinner: React.FC = () => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '80px 20px',
    gap: '20px',
  }}>
    <div style={{
      width: '50px',
      height: '50px',
      border: '3px solid rgba(102, 126, 234, 0.2)',
      borderTopColor: '#667eea',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite',
    }} />
    <span style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '14px' }}>
      加载排班数据中...
    </span>
  </div>
);

// 错误状态
const ErrorState: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '80px 20px',
    gap: '20px',
  }}>
    <div style={{ fontSize: '64px' }}>⚠️</div>
    <div style={{ color: '#ff6b6b', fontSize: '16px', textAlign: 'center', maxWidth: '400px' }}>
      {message}
    </div>
    <button
      onClick={onRetry}
      style={{
        padding: '12px 24px',
        borderRadius: '8px',
        border: 'none',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: '#fff',
        fontSize: '14px',
        cursor: 'pointer',
        transition: 'transform 0.2s ease',
      }}
      onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
      onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
    >
      重试
    </button>
  </div>
);

// 空状态
const EmptyState: React.FC = () => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '80px 20px',
    gap: '16px',
  }}>
    <div style={{ fontSize: '72px', opacity: 0.5 }}>📅</div>
    <div style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '18px' }}>
      暂无排班数据
    </div>
    <div style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '14px' }}>
      请选择其他日期查看排班信息
    </div>
  </div>
);

// 汇总统计
const SummaryStats: React.FC<{ accounts: AccountSchedule[] }> = ({ accounts }) => {
  const totalPersons = accounts.reduce((sum, acc) => sum + acc.schedules.length, 0);
  const totalHours = accounts.reduce(
    (sum, acc) => sum + acc.schedules.reduce((s, p) => s + p.totalHours, 0),
    0
  );
  const totalEarlyMorning = accounts.reduce(
    (sum, acc) => sum + acc.schedules.reduce((s, p) => s + p.earlyMorningHours, 0),
    0
  );

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      gap: '16px',
      marginBottom: '24px',
    }}>
      <div style={{
        background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.15) 100%)',
        borderRadius: '16px',
        padding: '20px',
        border: '1px solid rgba(102, 126, 234, 0.3)',
      }}>
        <div style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '12px', marginBottom: '8px' }}>
          当日排班人数
        </div>
        <div style={{ color: '#fff', fontSize: '28px', fontWeight: '700' }}>
          {totalPersons}
        </div>
      </div>
      <div style={{
        background: 'linear-gradient(135deg, rgba(67, 233, 123, 0.15) 0%, rgba(56, 249, 215, 0.15) 100%)',
        borderRadius: '16px',
        padding: '20px',
        border: '1px solid rgba(67, 233, 123, 0.3)',
      }}>
        <div style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '12px', marginBottom: '8px' }}>
          总直播时长
        </div>
        <div style={{ color: '#fff', fontSize: '28px', fontWeight: '700' }}>
          {totalHours} <span style={{ fontSize: '14px', fontWeight: '400' }}>小时</span>
        </div>
      </div>
      <div style={{
        background: 'linear-gradient(135deg, rgba(255, 183, 77, 0.15) 0%, rgba(255, 184, 45, 0.15) 100%)',
        borderRadius: '16px',
        padding: '20px',
        border: '1px solid rgba(255, 183, 77, 0.3)',
      }}>
        <div style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '12px', marginBottom: '8px' }}>
          凌晨班时长
        </div>
        <div style={{ color: '#ffb84d', fontSize: '28px', fontWeight: '700' }}>
          {totalEarlyMorning} <span style={{ fontSize: '14px', fontWeight: '400' }}>小时</span>
        </div>
      </div>
      <div style={{
        background: 'linear-gradient(135deg, rgba(79, 172, 254, 0.15) 0%, rgba(0, 212, 255, 0.15) 100%)',
        borderRadius: '16px',
        padding: '20px',
        border: '1px solid rgba(79, 172, 254, 0.3)',
      }}>
        <div style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '12px', marginBottom: '8px' }}>
          监控账号数
        </div>
        <div style={{ color: '#fff', fontSize: '28px', fontWeight: '700' }}>
          {accounts.length}
        </div>
      </div>
    </div>
  );
};

// 主组件
export default function SchedulePage() {
  const getToday = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [selectedBrand, setSelectedBrand] = useState<BrandId>('vivo');
  const [selectedRole, setSelectedRole] = useState<RoleId>('anchor');
  const [selectedDate, setSelectedDate] = useState<string>('2026-06-01');
  const [activeAccount, setActiveAccount] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);

  // 初始化日期
  useEffect(() => {
    const today = getToday();
    const range = BRAND_DATE_RANGE[selectedBrand];
    if (today >= range.min && today <= range.max) {
      setSelectedDate(today);
    } else {
      setSelectedDate(range.min);
    }
  }, []);

  // 品牌切换时调整日期范围
  useEffect(() => {
    const range = BRAND_DATE_RANGE[selectedBrand];
    if (selectedDate < range.min || selectedDate > range.max) {
      setSelectedDate(range.min);
    }
    setActiveAccount('all');
  }, [selectedBrand]);

  // 获取数据
  const fetchData = useCallback(async (date: string, brand: BrandId, role: RoleId) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ date, brand, role });
      const response = await fetch(`/api/schedule?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      setData(result);
    } catch (err: any) {
      console.error('Fetch error:', err);
      setError(err.message || '获取排班数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 数据加载
  useEffect(() => {
    fetchData(selectedDate, selectedBrand, selectedRole);
  }, [selectedDate, selectedBrand, selectedRole, fetchData]);

  // 日期切换
  const dateRange = BRAND_DATE_RANGE[selectedBrand];

  const handleDateChange = (days: number) => {
    const currentDate = new Date(selectedDate);
    currentDate.setDate(currentDate.getDate() + days);

    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const newDate = `${year}-${month}-${day}`;

    if (newDate >= dateRange.min && newDate <= dateRange.max) {
      setSelectedDate(newDate);
    }
  };

  // 过滤后的数据
  const filteredAccounts = useMemo(() => {
    if (!data?.accounts) return [];
    if (activeAccount === 'all') return data.accounts;
    return data.accounts.filter(acc => acc.name === activeAccount);
  }, [data, activeAccount]);

  // 格式化日期显示
  const formatDateDisplay = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const weekday = weekdays[date.getDay()];
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}月${day}日 ${weekday}`;
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%)',
      padding: '24px',
    }}>
      {/* 页面标题 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '32px',
        flexWrap: 'wrap',
        gap: '16px',
      }}>
        <div>
          <h1 style={{
            color: '#fff',
            fontSize: '32px',
            fontWeight: '700',
            margin: '0 0 8px 0',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Blue直播主播排班管理
          </h1>
          <p style={{
            color: 'rgba(255, 255, 255, 0.5)',
            fontSize: '14px',
            margin: 0,
          }}>
            直播人员排班与时长统计
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* 角色切换按钮 */}
          <div style={{
            display: 'flex',
            borderRadius: '8px',
            overflow: 'hidden',
            border: '1px solid rgba(102, 126, 234, 0.4)',
          }}>
            {ROLES.map(role => (
              <button
                key={role.id}
                onClick={() => setSelectedRole(role.id)}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  background: selectedRole === role.id
                    ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                    : 'rgba(255, 255, 255, 0.05)',
                  color: selectedRole === role.id ? '#fff' : 'rgba(255, 255, 255, 0.6)',
                  fontSize: '13px',
                  fontWeight: selectedRole === role.id ? '600' : '400',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                {role.label}
              </button>
            ))}
          </div>
          {/* 数据源标识 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '8px',
            color: 'rgba(255, 255, 255, 0.7)',
            fontSize: '13px',
          }}>
            <span style={{ color: '#66df7c' }}>●</span>
            数据来源：飞书排班表
          </div>
        </div>
      </div>

      {/* 日期选择器 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        marginBottom: '16px',
        flexWrap: 'wrap',
      }}>
        <button
          onClick={() => handleDateChange(-1)}
          disabled={selectedDate <= dateRange.min}
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            background: 'rgba(255, 255, 255, 0.05)',
            color: '#fff',
            fontSize: '16px',
            cursor: selectedDate <= dateRange.min ? 'not-allowed' : 'pointer',
            opacity: selectedDate <= dateRange.min ? 0.5 : 1,
          }}
        >
          ← 前一天
        </button>

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
        }}>
          <input
            type="date"
            value={selectedDate}
            min={dateRange.min}
            max={dateRange.max}
            onChange={(e) => {
              const v = e.target.value;
              if (v >= dateRange.min && v <= dateRange.max) {
                setSelectedDate(v);
              }
            }}
            style={{
              padding: '12px 20px',
              borderRadius: '12px',
              border: '2px solid rgba(102, 126, 234, 0.5)',
              background: 'rgba(255, 255, 255, 0.08)',
              color: '#fff',
              fontSize: '18px',
              fontWeight: '600',
              outline: 'none',
              cursor: 'pointer',
            }}
          />
          <span style={{
            color: '#667eea',
            fontSize: '16px',
            fontWeight: '600',
          }}>
            {formatDateDisplay(selectedDate)}
          </span>
        </div>

        <button
          onClick={() => handleDateChange(1)}
          disabled={selectedDate >= dateRange.max}
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            background: 'rgba(255, 255, 255, 0.05)',
            color: '#fff',
            fontSize: '16px',
            cursor: selectedDate >= dateRange.max ? 'not-allowed' : 'pointer',
            opacity: selectedDate >= dateRange.max ? 0.5 : 1,
          }}
        >
          后一天 →
        </button>

        <button
          onClick={() => {
            const today = getToday();
            if (today >= dateRange.min && today <= dateRange.max) {
              setSelectedDate(today);
            }
          }}
          style={{
            padding: '12px 20px',
            borderRadius: '8px',
            border: 'none',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: '#fff',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'transform 0.2s ease',
          }}
          onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          今天
        </button>
      </div>

      {/* 品牌切换标签 */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '24px',
      }}>
        {BRANDS.map(brand => (
          <button
            key={brand.id}
            onClick={() => setSelectedBrand(brand.id)}
            style={{
              padding: '10px 24px',
              borderRadius: '8px',
              border: 'none',
              background: selectedBrand === brand.id
                ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                : 'rgba(255, 255, 255, 0.05)',
              color: selectedBrand === brand.id ? '#fff' : 'rgba(255, 255, 255, 0.6)',
              fontSize: '14px',
              fontWeight: selectedBrand === brand.id ? '600' : '400',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: selectedBrand === brand.id
                ? '0 4px 15px rgba(102, 126, 234, 0.4)'
                : 'none',
            }}
          >
            {brand.label}
          </button>
        ))}
      </div>

      {/* 内容区域 */}
      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorState message={error} onRetry={() => fetchData(selectedDate, selectedBrand, selectedRole)} />
      ) : !data || filteredAccounts.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <AccountTabs
            accounts={data.accounts || []}
            activeAccount={activeAccount}
            onAccountChange={setActiveAccount}
          />

          <SummaryStats accounts={filteredAccounts} />

          {filteredAccounts.map((account) => (
            <AccountGroup
              key={account.name}
              account={account}
              color={getAccountColor(account.name)}
            />
          ))}
        </>
      )}

      {/* 动画样式 */}
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        input[type="date"]::-webkit-calendar-picker-indicator {
          filter: invert(1);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
