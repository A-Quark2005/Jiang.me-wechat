const avatar = require('../../services/avatar');

function presentDemand(rawDemand, expandedApplicationId, contactAccessByUserId) {
  if (!rawDemand) return null;
  const rawApplications = Array.isArray(rawDemand.applications) ? rawDemand.applications : [];
  const rawMyApplication = rawDemand.myApplication || null;
  const myApplicationId = rawMyApplication ? String(rawMyApplication.id || '') : '';
  const applications = rawApplications.map((item) => (
    presentApplication(
      item,
      expandedApplicationId,
      Boolean(myApplicationId && String(item.id || '') === myApplicationId),
      contactAccessByUserId
    )
  ));
  const myApplication = rawMyApplication ? presentApplication(rawMyApplication, '', true, contactAccessByUserId) : null;
  const organizationNames = Array.isArray(rawDemand.organizations)
    ? rawDemand.organizations.map((item) => String(item.name || '').trim()).filter(Boolean)
    : [];
  const organizationText = organizationNames.join('、');
  const applicationLimit = Number(rawDemand.applicationLimit || 1);
  const totalApplicationCount = Number(rawDemand.totalApplicationCount || 0);
  const activeApplicationCount = Number(rawDemand.activeApplicationCount || totalApplicationCount || 0);
  const isOpen = rawDemand.status === 'open';
  const isClosed = rawDemand.status === 'closed';
  const isPoster = Boolean(rawDemand.isPoster);
  const myApplicationSelected = Boolean(
    rawMyApplication &&
    (
      rawMyApplication.selectedContactDepositOrderId ||
      rawMyApplication.selectedAt ||
      rawMyApplication.selected
    )
  );
  const canEditMyApplicationMessage = Boolean(myApplication && !isPoster && !isClosed && !myApplicationSelected);
  const myApplicationMessage = myApplication && myApplication.message ? String(myApplication.message) : '';
  const showMyApplication = Boolean(myApplication && !isPoster);
  const showApplyControl = Boolean(!isPoster && (isOpen || showMyApplication));
  const isApplicationFull = activeApplicationCount >= applicationLimit;
  const referralRewardCents = Math.floor(Number(rawDemand.amountCents || 0) * 0.25);
  const referralRewardText = moneyText(referralRewardCents);
  const showShareAction = Boolean(!isPoster && isOpen && !isApplicationFull);
  const showCloseAction = Boolean(isPoster && !isClosed);
  const showEditAction = Boolean(isPoster && !isClosed);
  const isFilled = rawDemand.status === 'filled';
  const filledDecision = presentFilledDecision(rawDemand.filledDecision);
  const applyActionEnabled = Boolean(rawDemand.canApply);
  const applyDisabledHint = !isPoster && !myApplication && !applyActionEnabled
    ? rawDemand.applyDisabledReason || ''
    : '';
  const poster = rawDemand.poster || {};

  return {
    ...rawDemand,
    poster: {
      ...poster,
      avatarUrlResolved: avatar.resolveAvatarUrl(poster.avatarUrl),
      displayNameText: poster.displayName || '发布人',
    },
    showPosterProfile: Boolean(!isPoster),
    applications,
    myApplication,
    organizationText,
    hasOrganizations: organizationNames.length > 0,
    requirementText: organizationText || '无认证要求，所有人都可以投递简历',
    hasDescription: Boolean(rawDemand.description),
    hasApplications: applications.length > 0,
    totalApplicationCount,
    activeApplicationCount,
    applicationLimit,
    referralRewardCents,
    referralRewardText,
    candidateCountText: `已收到 ${totalApplicationCount}/${applicationLimit} 份简历`,
    overviewMetaText: isPoster
      ? `已收到 ${totalApplicationCount}/${applicationLimit} 份简历，收满后会自动撤下`
      : `已收到 ${totalApplicationCount}/${applicationLimit} 份简历，符合条件即可投递`,
    filledDecision,
    showFilledDecisionCountdown: Boolean(filledDecision.showCountdown),
    showCandidateList: true,
    showBottomBar: Boolean(showApplyControl || showShareAction),
    showApplyControl,
    showShareAction,
    showMyApplicationCard: Boolean(myApplication && !isPoster),
    myApplicationMessageText: myApplicationMessage || '还没有填写留言',
    myApplicationMessageEmpty: !myApplicationMessage,
    myApplicationMessageActionText: myApplicationMessage ? '修改留言' : '补充留言',
    canEditMyApplicationMessage,
    showCloseAction,
    showEditAction,
    closeActionText: isFilled ? '结束需求' : '撤下需求',
    closeModalTitle: isFilled ? '结束需求' : '撤下需求',
    closeModalContent: isFilled
      ? '结束后，需求将标记为已结束。已收到的简历仍可继续查看。'
      : '撤下后将不再出现在公域需求列表中，也不能继续接收新的简历。已投递的简历仍可在详情页查看。',
    closeModalConfirmText: isFilled ? '结束' : '撤下',
    closeSuccessText: isFilled ? '已结束' : '已撤下',
    closeFailureTitle: isFilled ? '结束失败' : '撤下失败',
    applyActionEnabled,
    applyActionText: applyActionEnabled ? '我想试试' : (myApplication ? myApplication.statusText : '暂不符合要求'),
    applyDisabledHint,
    showApplyDisabledHint: Boolean(applyDisabledHint),
    shareTipText: `转发给合适的人，成功匹配可得介绍费 ${referralRewardText}`,
    emptyCandidateText: isPoster ? '还没有人投递，请耐心等待，有新简历会通过微信消息通知' : '还没有人投递，可以先投递简历',
    showMyApplication: false,
  };
}

function presentFilledDecision(rawDecision) {
  const remainingSeconds = Math.max(0, Math.ceil(Number(rawDecision && rawDecision.remainingSeconds || 0)));
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return {
    ...(rawDecision || {}),
    remainingSeconds,
    showCountdown: Boolean(rawDecision && rawDecision.showCountdown && remainingSeconds > 0),
    remainingText: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
    hintLines: remainingSeconds > 0
      ? [
        '简历已收满，请尽快查看简历并联系合适的人选。',
        `剩余 ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} 后，需求将自动结束。`,
      ]
      : [],
  };
}

function presentApplication(application, expandedApplicationId, isMine, contactAccessByUserId) {
  const resume = application.resume || {};
  const credentials = Array.isArray(resume.credentials) ? resume.credentials.map(presentCredential) : [];
  const engagements = Array.isArray(resume.engagements) ? resume.engagements.map(presentEngagement) : [];
  const credentialCount = credentials.length;
  const engagementCount = engagements.length;
  const expanded = application.id === expandedApplicationId;
  const publicUserId = application.applicantUserId || resume.publicId || '';
  const contactAccess = contactAccessByUserId && publicUserId ? contactAccessByUserId[String(publicUserId)] : null;
  const hasContactAccess = Boolean((application.contactAccess && application.contactAccess.hasPaid) || (contactAccess && contactAccess.hasPaid));
  return {
    ...application,
    publicUserId,
    expanded,
    isMine: Boolean(isMine),
    detailButtonText: expanded ? '收起' : '查看简历',
    contactButtonText: hasContactAccess ? '查看手机号' : (expanded ? '缴纳定金，认识一下' : '认识一下'),
    showMessage: Boolean(application.message),
    summaryText: `${credentialCount} 个认证，${engagementCount} 条履历`,
    resume: {
      ...resume,
      avatarUrlResolved: avatar.resolveAvatarUrl(resume.avatarUrl),
      displayNameText: resume.displayName || '未命名用户',
      selfIntroductionText: resume.selfIntroduction || '暂无自我介绍',
      credentials,
      engagements,
      hasCredentials: credentialCount > 0,
      hasEngagements: engagementCount > 0,
    },
  };
}

function presentCredential(item) {
  return {
    ...item,
    titleText: item.title || item.organizationName || '',
    metaText: item.emailMasked || item.typeLabel || '',
  };
}

function presentEngagement(item) {
  return {
    ...item,
    titleText: item.title || '服务履历',
    metaText: [item.counterpartName, item.confirmedAt ? String(item.confirmedAt).slice(0, 10) : ''].filter(Boolean).join(' · '),
    descriptionText: item.description || '',
  };
}

function moneyText(cents) {
  return `¥${(Number(cents || 0) / 100).toFixed(2)}`;
}

module.exports = {
  presentDemand,
};
