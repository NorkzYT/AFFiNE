import { useQuery } from '@affine/admin/use-query';
import { listUsersQuery } from '@affine/graphql';
import { useMemo, useState } from 'react';

export const useUserList = () => {
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });
  const variables = useMemo(
    () => ({
      filter: {
        first: pagination.pageSize,
        skip: pagination.pageIndex * pagination.pageSize,
      },
    }),
    [pagination]
  );
  const {
    data: { users, usersCount },
  } = useQuery({
    query: listUsersQuery,
    variables,
  });

  return {
    users,
    pagination,
    setPagination,
    usersCount,
  };
};
