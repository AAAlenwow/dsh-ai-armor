#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)/sample-app"
mkdir -p "${ROOT}/src/main/java/com/example/service"
mkdir -p "${ROOT}/src/main/java/com/example/mapper"
mkdir -p "${ROOT}/src/main/resources/mapper"

cat > "${ROOT}/src/main/java/com/example/mapper/UserMapper.java" <<'JAVA'
package com.example.mapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.example.entity.User;
import org.apache.ibatis.annotations.Mapper;
@Mapper
public interface UserMapper extends BaseMapper<User> {}
JAVA

cat > "${ROOT}/src/main/java/com/example/service/UserService.java" <<'JAVA'
package com.example.service;
import com.example.entity.User;
import com.example.mapper.UserMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

@Service
public class UserService {
    @Autowired private UserMapper userMapper;

    @Transactional(rollbackFor = Exception.class)
    public void transfer(Long fromId, Long toId) {
        userMapper.update(null, null);
        userMapper.insert(null);
    }

    public List<User> findAll() {
        return userMapper.selectList(null);
    }
}
JAVA

cat > "${ROOT}/src/main/resources/mapper/UserMapper.xml" <<'XML'
<?xml version="1.0" encoding="UTF-8" ?>
<mapper namespace="com.example.mapper.UserMapper">
    <select id="findById" resultType="com.example.entity.User">
        SELECT id, name, email FROM users WHERE id = #{id}
    </select>
    <update id="updateName">
        UPDATE users SET name = #{name} WHERE id = #{id}
    </update>
    <select id="searchByPrefix" resultType="com.example.entity.User">
        SELECT id, name FROM users WHERE name LIKE #{prefix}
    </select>
</mapper>
XML
