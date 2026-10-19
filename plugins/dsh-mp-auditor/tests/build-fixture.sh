#!/usr/bin/env bash
# tests/build-fixture.sh — create a fake MyBatis Plus project with
# intentional issues at the absolute target dir passed as $1.
set -euo pipefail
ROOT="${1:?usage: build-fixture.sh <absolute-target-dir>}"
mkdir -p "${ROOT}/src/main/java/com/example/service"
mkdir -p "${ROOT}/src/main/java/com/example/mapper"
mkdir -p "${ROOT}/src/main/resources/mapper"

cat > "${ROOT}/src/main/java/com/example/mapper/UserMapper.java" <<'JAVA'
package com.example.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.example.entity.User;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface UserMapper extends BaseMapper<User> {
    @Select("SELECT * FROM users WHERE name = #{name}")
    User findByName(String name);
}
JAVA

cat > "${ROOT}/src/main/java/com/example/service/UserService.java" <<'JAVA'
package com.example.service;

import com.example.entity.User;
import com.example.mapper.UserMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.util.List;

@Service
public class UserService {
    @Autowired
    private UserMapper userMapper;

    // BAD: missing @Transactional, has multiple writes
    public void transferAndLog(Long fromId, Long toId, String note) {
        userMapper.update(null, null);
        userMapper.insert(null);
    }

    // BAD: N+1 — loop calling mapper.find*
    public List<User> enrichUsers(List<Long> ids) {
        for (Long id : ids) {
            userMapper.findById(id);
        }
        return null;
    }
}
JAVA

cat > "${ROOT}/src/main/resources/mapper/UserMapper.xml" <<'XML'
<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.example.mapper.UserMapper">
    <!-- BAD: SELECT * -->
    <select id="findAll" resultType="com.example.entity.User">
        SELECT * FROM users
    </select>

    <!-- BAD: no WHERE clause -->
    <update id="clearAll">
        UPDATE users SET active = 0
    </update>

    <!-- BAD: leading wildcard LIKE '%xxx%' -->
    <select id="searchByName" resultType="com.example.entity.User">
        SELECT id, name FROM users WHERE name LIKE '%${keyword}%'
    </select>

    <!-- OK: explicit columns, with WHERE, no leading % -->
    <select id="findById" resultType="com.example.entity.User">
        SELECT id, name, email FROM users WHERE id = #{id}
    </select>
</mapper>
XML
