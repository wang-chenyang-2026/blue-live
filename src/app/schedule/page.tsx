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

interface DayStats {
  personCount: number;
  totalHours: number;
  earlyMorningHours: number;
}

interface AccountData {
  accountName: string;
  personSummary: PersonSchedule[];
  dateRange: { iso: string; display: string; weekday: string }[];
  gridData: Record<string, Record<string, string[]>>;
  stats: {
    personCount: number;
    totalHours: number;
    earlyMorningHours: number;
    coveredDays: number;
  };
}

interface ApiResponseRange {
  success: boolean;
  data: {
    dateRange: { iso: string; display: string; weekday: string }[];
    accounts: AccountData[];
  };
}

interface ApiResponseDay {
  success: boolean;
  data: {
    date: string;
    brand: string;
    accounts: {
      accountName: string;
      schedules: PersonSchedule[];
      stats: DayStats;
    }[];
  };
}

// 账号Tab组件
const AccountTabs: React.FC<{
  accounts: { name: string; schedules: PersonSchedule[] }[];
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
      {/* 人员名称 */}
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

      {/* 时间段展示 */}
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
          {schedule.timeSlots.map((slot, index) => (
            <span
              key={index}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                background: slot.includes('2-') || slot.includes('3-') || slot.includes('4-') || slot.includes('5-') || slot.includes('6-') || slot.includes('7-')
                  ? 'rgba(147, 130, 220, 0.25)'
                  : 'rgba(79, 172, 254, 0.15)',
                color: slot.includes('2-') || slot.includes('3-') || slot.includes('4-') || slot.includes('5-') || slot.includes('6-') || slot.includes('7-')
                  ? '#b8a9e8'
                  : '#7ec8f8',
                fontSize: '12px',
                border: '1px solid ' + (slot.includes('2-') || slot.includes('3-') || slot.includes('4-') || slot.includes('5-') || slot.includes('6-') || slot.includes('7-')
                  ? 'rgba(147, 130, 220, 0.3)'
                  : 'rgba(79, 172, 254, 0.2)'),
              }}
            >
              {slot}
            </span>
          ))}
        </div>
      </div>

      {/* 凌晨班统计 */}
      {schedule.earlyMorningHours > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          borderRadius: '8px',
          background: 'rgba(147, 130, 220, 0.1)',
          border: '1px solid rgba(147, 130, 220, 0.2)',
        }}>
          <span style={{ fontSize: '16px' }}>🌙</span>
          <span style={{
            color: '#b8a9e8',
            fontSize: '13px',
          }}>
            凌晨班 {schedule.earlyMorningHours} 小时
          </span>
        </div>
      )}
    </div>
  );
};

// 统计卡片
const StatCard: React.FC<{
  label: string;
  value: string | number;
  icon: string;
  color: string;
}> = ({ label, value, icon, color }) => (
  <div style={{
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '12px',
    padding: '16px 20px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  }}>
    <div style={{
      width: '48px',
      height: '48px',
      borderRadius: '12px',
      background: `${color}15`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '22px',
    }}>
      {icon}
    </div>
    <div>
      <div style={{
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: '12px',
        marginBottom: '4px',
      }}>
        {label}
      </div>
      <div style={{
        color: color,
        fontSize: '22px',
        fontWeight: '700',
      }}>
        {value}
      </div>
    </div>
  </div>
);

// 主页面组件
export default function SchedulePage() {
  const [selectedDate, setSelectedDate] = useState('2026-06-01');
  const [isClient, setIsClient] = useState(false);
  const [activeAccount, setActiveAccount] = useState('all');
  const [data, setData] = useState<ApiResponseDay | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 修复hydration: 客户端挂载后设置为今天日期
  useEffect(() => {
    setIsClient(true);
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    setSelectedDate(`${yyyy}-${mm}-${dd}`);
  }, []);

  // 加载数据
  const fetchData = useCallback(async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/schedule?date=${date}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result: ApiResponseDay = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch schedule data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(selectedDate);
  }, [selectedDate, fetchData]);

  // 日期导航
  const navigateDate = (direction: number) => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + direction);
    const newDate = current.toISOString().split('T')[0];
    setSelectedDate(newDate);
  };

  // 格式化日期显示
  const formatDateDisplay = (dateStr: string) => {
    const date = new Date(dateStr);
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    return `${date.getMonth() + 1}月${date.getDate()}日 周${weekdays[date.getDay()]}`;
  };

  // 过滤账号数据
  const filteredAccounts = useMemo(() => {
    if (!data?.data?.accounts) return [];
    if (activeAccount === 'all') return data.data.accounts;
    return data.data.accounts.filter(acc => acc.accountName === activeAccount);
  }, [data, activeAccount]);

  // 汇总统计
  const totalStats = useMemo(() => {
    if (!data?.data?.accounts) return { personCount: 0, totalHours: 0, earlyMorningHours: 0 };
    return (data.data.accounts || []).reduce((acc, cur) => ({
      personCount: acc.personCount + (cur.stats?.personCount || 0),
      totalHours: acc.totalHours + (cur.stats?.totalHours || 0),
      earlyMorningHours: acc.earlyMorningHours + (cur.stats?.earlyMorningHours || 0),
    }), { personCount: 0, totalHours: 0, earlyMorningHours: 0 });
  }, [data]);

  const accountColors: Record<string, string> = {
    'vivo（大号）': '#415FFF',
    'vivo官方旗舰店（抖音）': '#FF6B35',
    'vivo官方旗舰店（快手）': '#00C9A7',
  };

  return (
    <div style={{
      padding: '24px',
      maxWidth: '1400px',
      margin: '0 auto',
      color: '#fff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      {/* 页面标题 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '32px',
      }}>
        <h1 style={{
          fontSize: '28px',
          fontWeight: '700',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          margin: 0,
        }}>
          排班管理
        </h1>
        <div style={{
          color: 'rgba(255, 255, 255, 0.5)',
          fontSize: '14px',
        }}>
          数据来源：飞书电子表格
        </div>
      </div>

      {/* 日期选择器 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        marginBottom: '28px',
        padding: '16px 24px',
        background: 'rgba(255, 255, 255, 0.03)',
        borderRadius: '16px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
      }}>
        <button
          onClick={() => navigateDate(-1)}
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            background: 'rgba(255, 255, 255, 0.05)',
            color: '#fff',
            fontSize: '18px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ‹
        </button>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flex: 1,
          justifyContent: 'center',
        }}>
          <span style={{
            fontSize: '18px',
            fontWeight: '600',
            color: '#fff',
          }}>
            {formatDateDisplay(selectedDate)}
          </span>
        </div>
        <button
          onClick={() => navigateDate(1)}
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            background: 'rgba(255, 255, 255, 0.05)',
            color: '#fff',
            fontSize: '18px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ›
        </button>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          style={{
            padding: '8px 16px',
            borderRadius: '10px',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            background: 'rgba(255, 255, 255, 0.05)',
            color: '#fff',
            fontSize: '14px',
            cursor: 'pointer',
          }}
        />
        <button
          onClick={() => fetchData(selectedDate)}
          disabled={loading}
          style={{
            padding: '8px 20px',
            borderRadius: '10px',
            border: 'none',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: '#fff',
            fontSize: '14px',
            fontWeight: '600',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? '加载中...' : '刷新数据'}
        </button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div style={{
          padding: '16px',
          borderRadius: '12px',
          background: 'rgba(255, 107, 107, 0.1)',
          border: '1px solid rgba(255, 107, 107, 0.3)',
          color: '#ff6b6b',
          marginBottom: '24px',
        }}>
          {error}
        </div>
      )}

      {/* 加载状态 */}
      {loading && (
        <div style={{
          textAlign: 'center',
          padding: '60px',
          color: 'rgba(255, 255, 255, 0.5)',
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid rgba(102, 126, 234, 0.3)',
            borderTopColor: '#667eea',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px',
          }} />
          加载排班数据...
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* 数据内容 */}
      {!loading && data && (
        <>
          {/* 统计概览 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '28px',
          }}>
            <StatCard
              label="排班人数"
              value={totalStats.personCount}
              icon="👥"
              color="#4facfe"
            />
            <StatCard
              label="总时长"
              value={`${totalStats.totalHours}h`}
              icon="⏱️"
              color="#66df7c"
            />
            <StatCard
              label="凌晨班时长"
              value={`${totalStats.earlyMorningHours}h`}
              icon="🌙"
              color="#b8a9e8"
            />
          </div>

          {/* 账号Tab */}
          <AccountTabs
            accounts={(data?.data?.accounts || []).map(acc => ({
              name: acc.accountName,
              schedules: acc.schedules || [],
            }))}
            activeAccount={activeAccount}
            onAccountChange={setActiveAccount}
          />

          {/* 人员排班卡片 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
            gap: '16px',
          }}>
            {filteredAccounts.map(account => (
              <React.Fragment key={account.accountName}>
                {(account.schedules || []).map((schedule, idx) => (
                  <PersonCard
                    key={`${account.accountName}-${schedule.person}`}
                    schedule={schedule}
                    accountColor={accountColors[account.accountName] || '#667eea'}
                  />
                ))}
              </React.Fragment>
            ))}
          </div>

          {/* 空状态 */}
          {filteredAccounts.length === 0 && (
            <div style={{
              textAlign: 'center',
              padding: '80px 20px',
              color: 'rgba(255, 255, 255, 0.4)',
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
              <div style={{ fontSize: '16px', marginBottom: '8px' }}>该日期暂无排班数据</div>
              <div style={{ fontSize: '14px' }}>请选择其他日期查看</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
