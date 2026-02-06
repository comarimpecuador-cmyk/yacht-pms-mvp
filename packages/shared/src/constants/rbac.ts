import { RoleName } from '../enums/roles';

export const RBAC_PERMISSIONS = {
  requisitions: {
    approveLevel1: [RoleName.HoD],
    approveLevel2: [RoleName.Captain],
    approveLevel3: [RoleName.ManagementOffice],
  },
  maintenance: {
    executeTask: [RoleName.ChiefEngineer, RoleName.CrewMember],
  },
} as const;
